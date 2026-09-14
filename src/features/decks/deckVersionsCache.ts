import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useConvex, type ConvexReactClient } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { storage } from "@/utils/storage"

import { scopedOwnerId, type DeckSyncStorage } from "./decksSync"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

type VersionsPage = FunctionReturnType<typeof api.decks.versionsPull>
type VersionRead = FunctionReturnType<typeof api.decks.readVersion>
export type CachedVersion = VersionsPage["page"][number]
export type CachedVersionCard = VersionRead["cards"][number]

export interface DeckVersionCacheSnapshot {
  versions: CachedVersion[]
  version: CachedVersion | undefined
  cards: CachedVersionCard[] | undefined
}

interface StoredVersions {
  schemaVersion: 1
  versions: CachedVersion[]
}

interface StoredCards {
  schemaVersion: 1
  revision: number
  cards: CachedVersionCard[]
}

function versionsKey(ownerId: string, deploymentUrl: string | undefined, deckId: string) {
  return `scryve.decks.versionList.v1.${scopedOwnerId(ownerId, deploymentUrl)}.${deckId}`
}

function cardsKey(ownerId: string, deploymentUrl: string | undefined, versionId: string) {
  return `scryve.decks.versionCards.v1.${scopedOwnerId(ownerId, deploymentUrl)}.${versionId}`
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

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

function isCachedVersion(value: unknown): value is CachedVersion {
  return (
    isRecord(value) &&
    typeof value.deckId === "string" &&
    typeof value.versionId === "string" &&
    isCount(value.revision) &&
    isCount(value.versionNumber) &&
    typeof value.name === "string" &&
    typeof value.note === "string" &&
    typeof value.fingerprint === "string" &&
    isCount(value.cardCount) &&
    isCount(value.cardQuantity) &&
    typeof value.deleted === "boolean" &&
    typeof value.updatedAt === "number"
  )
}

function isCachedCard(value: unknown): value is CachedVersionCard {
  return isRecord(value) && typeof value.name === "string" && isCount(value.quantity)
}

export class DeckVersionCacheRepository {
  constructor(
    readonly ownerId: string,
    private readonly local: DeckSyncStorage = storage,
    private readonly deploymentUrl?: string,
  ) {}

  loadVersions(deckId: string): CachedVersion[] {
    const value = parseJson(
      this.local.getString(versionsKey(this.ownerId, this.deploymentUrl, deckId)),
    )
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.versions)) return []
    return value.versions.filter(isCachedVersion)
  }

  mergeVersions(deckId: string, incoming: readonly CachedVersion[]): CachedVersion[] {
    const byId = new Map(this.loadVersions(deckId).map((version) => [version.versionId, version]))
    for (const version of incoming) {
      const current = byId.get(version.versionId)
      if (!current || version.revision >= current.revision) byId.set(version.versionId, version)
    }
    const versions = [...byId.values()]
    this.local.set(
      versionsKey(this.ownerId, this.deploymentUrl, deckId),
      JSON.stringify({ schemaVersion: 1, versions } satisfies StoredVersions),
    )
    return versions
  }

  loadCards(versionId: string): StoredCards | undefined {
    const value = parseJson(
      this.local.getString(cardsKey(this.ownerId, this.deploymentUrl, versionId)),
    )
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !isCount(value.revision) ||
      !Array.isArray(value.cards)
    )
      return undefined
    return { schemaVersion: 1, revision: value.revision, cards: value.cards.filter(isCachedCard) }
  }

  saveCards(versionId: string, revision: number, cards: readonly CachedVersionCard[]): StoredCards {
    const existing = this.loadCards(versionId)
    if (existing && existing.revision > revision) return existing
    const stored: StoredCards = { schemaVersion: 1, revision, cards: [...cards] }
    this.local.set(cardsKey(this.ownerId, this.deploymentUrl, versionId), JSON.stringify(stored))
    return stored
  }
}

const VERSION_PAGE_SIZE = 100
// ponytail: decks hold a handful of versions today; 10 pages is a runaway-fetch guard
const MAX_VERSION_PAGES = 10

export class DeckVersionCacheController {
  private readonly listeners = new Set<() => void>()
  private snapshot = new Map<string, DeckVersionCacheSnapshot>()
  private inFlight = new Set<string>()
  private users = 0
  private generation = 0

  constructor(
    private readonly client: Pick<ConvexReactClient, "query">,
    private readonly repository: DeckVersionCacheRepository,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  start(): () => void {
    this.users += 1
    return () => {
      this.users = Math.max(0, this.users - 1)
      this.generation += 1
    }
  }

  ensure(deckId: string, selectedVersionId: string | undefined): void {
    if (this.users === 0) return
    this.publish(deckId, selectedVersionId)
    const key = `${deckId}:${selectedVersionId ?? ""}`
    if (this.inFlight.has(key)) return
    const generation = ++this.generation
    this.inFlight.add(key)
    void this.refresh(deckId, selectedVersionId, generation, key)
  }

  private async refresh(
    deckId: string,
    selectedVersionId: string | undefined,
    generation: number,
    key: string,
  ): Promise<void> {
    try {
      const versions = await this.pullVersions(deckId, generation)
      if (generation !== this.generation) return
      this.publish(deckId, selectedVersionId)
      const versionId = selectedVersionId ?? this.latestActive(versions)?.versionId
      if (!versionId) return
      const metadata = versions.find((version) => version.versionId === versionId)
      const cached = this.repository.loadCards(versionId)
      if (cached && (!metadata || cached.revision >= metadata.revision)) return
      const read: VersionRead = await this.client.query(api.decks.readVersion, {
        deckId: deckId as Id<"decks">,
        versionId: versionId as Id<"deckVersions">,
      })
      if (generation !== this.generation) return
      if (read.version.deckId === deckId)
        this.repository.saveCards(versionId, read.version.revision, read.cards)
      this.publish(deckId, selectedVersionId)
    } catch {
      // Offline: the cached snapshot published by ensure() stands.
    } finally {
      this.inFlight.delete(key)
    }
  }

  private async pullVersions(deckId: string, generation: number): Promise<CachedVersion[]> {
    const merged: CachedVersion[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_VERSION_PAGES; page++) {
      const result: VersionsPage = await this.client.query(api.decks.versionsPull, {
        deckId: deckId as Id<"decks">,
        paginationOpts: { cursor, numItems: VERSION_PAGE_SIZE },
      })
      if (generation !== this.generation) return []
      if (result.deckId !== deckId) throw new Error("Version list for another deck")
      merged.push(...result.page)
      if (result.isDone) break
      cursor = result.continueCursor
    }
    return this.repository.mergeVersions(deckId, merged)
  }

  private latestActive(versions: readonly CachedVersion[]) {
    return versions.reduce<CachedVersion | undefined>(
      (latest, version) =>
        version.deleted || version.versionNumber <= (latest?.versionNumber ?? -1)
          ? latest
          : version,
      undefined,
    )
  }

  private publish(deckId: string, selectedVersionId: string | undefined): void {
    const versions = this.repository.loadVersions(deckId)
    const version = selectedVersionId
      ? versions.find((candidate) => candidate.versionId === selectedVersionId)
      : this.latestActive(versions)
    const stored = this.renderableCards(version)
    const next = new Map(this.snapshot)
    next.set(deckId, { versions, version, cards: stored })
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private renderableCards(version: CachedVersion | undefined) {
    if (!version || version.deleted) return undefined
    const stored = this.repository.loadCards(version.versionId)
    if (!stored || stored.revision < version.revision) return undefined
    return stored.cards
  }
}

const controllers = new WeakMap<object, Map<string, DeckVersionCacheController>>()

export function getDeckVersionCacheController(
  client: Pick<ConvexReactClient, "query" | "url">,
  ownerId: string,
  repository = new DeckVersionCacheRepository(ownerId, storage, client.url),
) {
  let byOwner = controllers.get(client)
  if (!byOwner) {
    byOwner = new Map()
    controllers.set(client, byOwner)
  }
  const existing = byOwner.get(ownerId)
  if (existing) return existing
  const controller = new DeckVersionCacheController(client, repository)
  byOwner.set(ownerId, controller)
  return controller
}

const emptySnapshot: DeckVersionCacheSnapshot = {
  versions: [],
  version: undefined,
  cards: undefined,
}
const noSubscribers = () => () => undefined

export function useDeckVersionCache(
  enabled: boolean,
  ownerId: string | undefined,
  deckId: string,
  selectedVersionId: string | undefined,
) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckVersionCacheController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => controller?.start(), [controller])
  useEffect(() => {
    controller?.ensure(deckId, selectedVersionId)
  }, [controller, deckId, selectedVersionId])
  return useSyncExternalStore(
    controller?.subscribe ?? noSubscribers,
    () => controller?.getSnapshot().get(deckId) ?? emptySnapshot,
    () => emptySnapshot,
  )
}
