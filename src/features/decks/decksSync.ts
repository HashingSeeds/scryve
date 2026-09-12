import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useConvex, type ConvexReactClient } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { storage } from "@/utils/storage"

import { api } from "../../../convex/_generated/api"

type SyncPage = FunctionReturnType<typeof api.decks.syncPage>
export type SyncedDeck = SyncPage["page"][number]
type MineDeck = FunctionReturnType<typeof api.decks.listMine>["decks"][number]
export type DeckShelfItem = Pick<MineDeck, "_id" | "name" | "format"> & Partial<MineDeck>

export interface DeckSyncStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
}

interface StoredMetadata {
  schemaVersion: 1
  decks: SyncedDeck[]
}

interface StoredShelf {
  schemaVersion: 1
  decks: readonly MineDeck[]
}

export interface DeckSyncSnapshot {
  decks: DeckShelfItem[]
  metadata: SyncedDeck[]
  loading: boolean
  unavailable?: boolean
}

const READ_FLAG_KEY = "scryve.decks.syncRead.v1"
const PAGE_SIZE = 100

function metadataKey(ownerId: string) {
  return `scryve.decks.syncMetadata.v1.${ownerId}`
}

function shelfKey(ownerId: string) {
  return `scryve.decks.syncShelf.v1.${ownerId}`
}

function parseJson(value: string | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isSyncedDeck(value: unknown): value is SyncedDeck {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.deckId === "string" &&
    Number.isSafeInteger(value.revision) &&
    typeof value.name === "string" &&
    typeof value.format === "string" &&
    typeof value.game === "string" &&
    typeof value.note === "string" &&
    typeof value.deleted === "boolean" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  )
}

function isMineDeck(value: unknown): value is MineDeck {
  return (
    isRecord(value) &&
    typeof value._id === "string" &&
    typeof value.name === "string" &&
    typeof value.format === "string"
  )
}

function storedDecks<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.decks)) return []
  return value.decks.filter(guard)
}

export function isDeckSyncEnabled() {
  return storage.getBoolean(READ_FLAG_KEY) ?? false
}

export function setDeckSyncEnabled(enabled: boolean) {
  storage.set(READ_FLAG_KEY, enabled)
}

export class DeckSyncRepository {
  constructor(
    readonly ownerId: string,
    private readonly local: DeckSyncStorage = storage,
  ) {}

  loadMetadata(): SyncedDeck[] {
    return storedDecks(parseJson(this.local.getString(metadataKey(this.ownerId))), isSyncedDeck)
  }

  mergeMetadata(incoming: readonly SyncedDeck[]): SyncedDeck[] {
    const byId = new Map(this.loadMetadata().map((deck) => [deck.deckId, deck]))
    for (const deck of incoming) {
      const current = byId.get(deck.deckId)
      if (!current || deck.revision >= current.revision) byId.set(deck.deckId, deck)
    }
    const decks = [...byId.values()]
    this.local.set(
      metadataKey(this.ownerId),
      JSON.stringify({ schemaVersion: 1, decks } satisfies StoredMetadata),
    )
    return decks
  }

  loadShelf(): MineDeck[] {
    return storedDecks(parseJson(this.local.getString(shelfKey(this.ownerId))), isMineDeck)
  }

  saveShelf(decks: readonly MineDeck[]): void {
    this.local.set(
      shelfKey(this.ownerId),
      JSON.stringify({ schemaVersion: 1, decks } satisfies StoredShelf),
    )
  }
}

export class DeckSyncController {
  private readonly listeners = new Set<() => void>()
  private subscriptions = new Map<string, () => void>()
  private metadata: SyncedDeck[]
  private shelf: MineDeck[]
  private snapshot: DeckSyncSnapshot
  private users = 0
  private generation = 0
  private refreshing = false
  private refreshAgain = false

  constructor(
    private readonly client: Pick<ConvexReactClient, "query" | "watchQuery">,
    private readonly repository: DeckSyncRepository,
  ) {
    this.metadata = repository.loadMetadata()
    this.shelf = repository.loadShelf()
    this.snapshot = this.buildSnapshot(true)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  start(): () => void {
    this.users += 1
    if (this.users === 1) {
      this.generation += 1
      void this.refresh()
    }
    return () => this.stop()
  }

  stop(): void {
    this.users = Math.max(0, this.users - 1)
    if (this.users > 0) return
    this.generation += 1
    for (const unsubscribe of this.subscriptions.values()) unsubscribe()
    this.subscriptions.clear()
  }

  saveShelf(decks: readonly MineDeck[]): void {
    this.shelf = [...decks]
    this.repository.saveShelf(decks)
    this.publish(this.snapshot.loading, this.snapshot.unavailable)
  }

  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true
      return
    }
    const generation = this.generation
    this.refreshing = true
    try {
      const decks: SyncedDeck[] = []
      const cursors: Array<string | null> = []
      let cursor: string | null = null
      do {
        cursors.push(cursor)
        this.watchPage(cursor, generation)
        const result: SyncPage = await this.client.query(api.decks.syncPage, {
          paginationOpts: { cursor, numItems: PAGE_SIZE },
        })
        if (generation !== this.generation || this.users === 0) return
        if (result.ownerId !== this.repository.ownerId) throw new Error("Account changed")
        decks.push(...result.page)
        cursor = result.isDone ? null : result.continueCursor
        if (result.isDone) break
      } while (cursor !== null)
      this.metadata = this.repository.mergeMetadata(decks)
      this.pruneSubscriptions(cursors)
      this.publish(false)
    } catch {
      if (generation === this.generation && this.users > 0) this.publish(false, true)
    } finally {
      this.refreshing = false
      if (this.refreshAgain && this.users > 0) {
        this.refreshAgain = false
        void this.refresh()
      }
    }
  }

  private pruneSubscriptions(cursors: readonly (string | null)[]): void {
    const wanted = new Set(cursors.map((cursor) => cursor ?? ""))
    for (const [key, unsubscribe] of this.subscriptions) {
      if (wanted.has(key)) continue
      unsubscribe()
      this.subscriptions.delete(key)
    }
  }

  private watchPage(cursor: string | null, generation: number): void {
    const key = cursor ?? ""
    if (this.subscriptions.has(key)) return
    const unsubscribe = this.client
      .watchQuery(api.decks.syncPage, { paginationOpts: { cursor, numItems: PAGE_SIZE } })
      .onUpdate(() => {
        if (generation === this.generation && this.users > 0) void this.refresh()
      })
    this.subscriptions.set(key, unsubscribe)
  }

  private buildSnapshot(loading: boolean): DeckSyncSnapshot {
    const summaries = new Map(this.shelf.map((deck) => [String(deck._id), deck]))
    const decks = [...this.metadata]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .flatMap((metadata) => {
        if (metadata.deleted) return []
        const summary = summaries.get(metadata.deckId)
        return [
          summary
            ? { ...summary, name: metadata.name, format: metadata.format, game: metadata.game }
            : {
                _id: metadata.deckId,
                name: metadata.name,
                format: metadata.format,
                game: metadata.game,
              },
        ]
      })
    return { decks, metadata: [...this.metadata], loading }
  }

  private publish(loading: boolean, unavailable = false): void {
    this.snapshot = { ...this.buildSnapshot(loading), unavailable }
    for (const listener of this.listeners) listener()
  }
}

const controllers = new WeakMap<object, Map<string, DeckSyncController>>()

export function getDeckSyncController(
  client: Pick<ConvexReactClient, "query" | "watchQuery">,
  ownerId: string,
  repository = new DeckSyncRepository(ownerId),
) {
  let byOwner = controllers.get(client)
  if (!byOwner) {
    byOwner = new Map()
    controllers.set(client, byOwner)
  }
  const existing = byOwner.get(ownerId)
  if (existing) return existing
  const controller = new DeckSyncController(client, repository)
  byOwner.set(ownerId, controller)
  return controller
}

const emptySnapshot: DeckSyncSnapshot = { decks: [], metadata: [], loading: true }

export function useDeckSync(
  enabled: boolean,
  ownerId?: string,
  shelf?: { ownerId: string; decks: readonly MineDeck[] },
) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckSyncController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => controller?.start(), [controller])
  useEffect(() => {
    if (shelf && shelf.ownerId === ownerId) controller?.saveShelf(shelf.decks)
  }, [controller, ownerId, shelf])
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? (() => () => undefined),
    controller?.getSnapshot ?? (() => emptySnapshot),
    controller?.getSnapshot ?? (() => emptySnapshot),
  )
  return { ...snapshot, retry: () => controller?.refresh() }
}
