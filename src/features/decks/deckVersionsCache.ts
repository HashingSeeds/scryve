import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useConvex, useConvexConnectionState, type ConvexReactClient } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { storage } from "@/utils/storage"

import { scopedOwnerId } from "./decksSync"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

type VersionsPage = FunctionReturnType<typeof api.decks.versionsPull>
type VersionRead = FunctionReturnType<typeof api.decks.readVersion>
export type CachedVersion = VersionsPage["page"][number]
export type CachedVersionCard = VersionRead["cards"][number]
export type StorableVersionCard = Omit<
  CachedVersionCard,
  "_id" | "_creationTime" | "deckVersionId"
> &
  Partial<Pick<CachedVersionCard, "_id" | "_creationTime" | "deckVersionId">>

/** Deletion support is scoped to this cache; MMKV satisfies it structurally. */
export interface DeckVersionCacheStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

export interface DeckVersionCacheSnapshot {
  versions: CachedVersion[]
  version: CachedVersion | undefined
  cards: StorableVersionCard[] | undefined
}

interface StoredVersions {
  schemaVersion: 1
  versions: CachedVersion[]
}

interface StoredCards {
  schemaVersion: 1
  revision: number
  cards: StorableVersionCard[]
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

function isCachedCard(value: unknown): value is StorableVersionCard {
  return isRecord(value) && typeof value.name === "string" && isCount(value.quantity)
}

export class DeckVersionCacheRepository {
  constructor(
    readonly ownerId: string,
    private readonly local: DeckVersionCacheStorage = storage,
    private readonly deploymentUrl?: string,
  ) {}

  loadVersions(deckId: string): CachedVersion[] {
    const value = parseJson(
      this.local.getString(versionsKey(this.ownerId, this.deploymentUrl, deckId)),
    )
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.versions)) return []
    return value.versions.filter(isCachedVersion)
  }

  /**
   * Merges a pull into the stored list, then reconciles retention: confirmed tombstones
   * and (only when the pull is authoritative-complete) rows absent from the server's list
   * are dropped together with their cached card payloads. Durable local write intent lives
   * elsewhere (D3) and is never touched — read-cache keys only.
   */
  mergeVersions(
    deckId: string,
    incoming: readonly CachedVersion[],
    complete = false,
  ): CachedVersion[] {
    const byId = new Map(this.loadVersions(deckId).map((version) => [version.versionId, version]))
    for (const version of incoming) {
      const current = byId.get(version.versionId)
      if (!current || version.revision >= current.revision) byId.set(version.versionId, version)
    }
    const dropped = new Set<string>()
    const versions = [...byId.values()].filter((version) => {
      if (version.deleted) {
        dropped.add(version.versionId)
        return false
      }
      return true
    })
    if (complete) {
      const authoritative = new Set(incoming.map((version) => version.versionId))
      for (let index = versions.length - 1; index >= 0; index--) {
        if (authoritative.has(versions[index].versionId)) continue
        dropped.add(versions[index].versionId)
        versions.splice(index, 1)
      }
    }
    for (const versionId of dropped)
      this.local.delete(cardsKey(this.ownerId, this.deploymentUrl, versionId))
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
      !Array.isArray(value.cards) ||
      !value.cards.every(isCachedCard)
    )
      return undefined
    return {
      schemaVersion: 1,
      revision: value.revision,
      cards: value.cards as CachedVersionCard[],
    }
  }

  saveCards(
    versionId: string,
    revision: number,
    cards: readonly StorableVersionCard[],
  ): StoredCards {
    const existing = this.loadCards(versionId)
    if (existing && existing.revision > revision) return existing
    const stored: StoredCards = { schemaVersion: 1, revision, cards: [...cards] }
    this.local.set(cardsKey(this.ownerId, this.deploymentUrl, versionId), JSON.stringify(stored))
    return stored
  }

  bumpVersion(deckId: string, versionId: string, revision: number): void {
    const versions = this.loadVersions(deckId)
    const current = versions.find((version) => version.versionId === versionId)
    const stored = this.loadCards(versionId)
    if (!current || current.revision >= revision || !stored) return
    const next = versions.map((version) =>
      version.versionId === versionId
        ? {
            ...version,
            revision,
            cardCount: stored.cards.length,
            cardQuantity: stored.cards.reduce((total, card) => total + card.quantity, 0),
          }
        : version,
    )
    this.local.set(
      versionsKey(this.ownerId, this.deploymentUrl, deckId),
      JSON.stringify({ schemaVersion: 1, versions: next } satisfies StoredVersions),
    )
  }
}

const VERSION_PAGE_SIZE = 100
// ponytail: decks hold a handful of versions today; 10 pages is a runaway-fetch guard
const MAX_VERSION_PAGES = 10

export class DeckVersionCacheController {
  private readonly listeners = new Set<() => void>()
  private snapshot = new Map<string, DeckVersionCacheSnapshot>()
  private wanted = new Map<string, string | undefined>()
  private inFlight = new Map<string, number>()
  private decks = new Map<string, number>()
  private users = 0
  private epoch = 0

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
      if (this.users > 0) return
      this.epoch += 1
      this.inFlight.clear()
      this.wanted.clear()
      this.decks.clear()
    }
  }

  /** Publishes the cached snapshot immediately, then refreshes from the server once. */
  ensure(deckId: string, selectedVersionId: string | undefined): void {
    if (this.users === 0) return
    this.wanted.set(deckId, selectedVersionId)
    this.publish(deckId)
    const key = `${deckId}:${selectedVersionId ?? ""}`
    if (this.inFlight.has(key)) return
    const ordinal = (this.decks.get(deckId) ?? 0) + 1
    this.decks.set(deckId, ordinal)
    this.inFlight.set(key, this.epoch)
    void this.refresh(deckId, ordinal, this.epoch, key)
  }

  /** Drops offline-stalled reads so the next ensure() refetches after a reconnect. */
  resume(): void {
    this.epoch += 1
    this.inFlight.clear()
    this.decks.clear()
  }

  /** Seeds version cards from a live detail read; never overwrites a newer cached revision. */
  record(
    deckId: string,
    versionId: string,
    revision: number,
    cards: readonly StorableVersionCard[],
  ): void {
    if (this.users === 0) return
    const cached = this.repository.loadCards(versionId)
    if (cached && cached.revision >= revision) return
    this.repository.saveCards(versionId, revision, cards)
    this.publish(deckId)
  }

  private superseded(deckId: string, ordinal: number, epoch: number): boolean {
    return epoch !== this.epoch || ordinal !== this.decks.get(deckId)
  }

  private async refresh(
    deckId: string,
    ordinal: number,
    epoch: number,
    key: string,
  ): Promise<void> {
    try {
      const versions = await this.pullVersions(deckId, epoch, ordinal)
      if (this.superseded(deckId, ordinal, epoch)) return
      this.publish(deckId)
      const versionId = this.wanted.get(deckId) ?? this.latestActive(versions)?.versionId
      if (!versionId) return
      const metadata = versions.find((version) => version.versionId === versionId)
      const cached = this.repository.loadCards(versionId)
      if (!metadata) return
      if (cached && cached.revision >= metadata.revision) return
      const read: VersionRead = await this.client.query(api.decks.readVersion, {
        deckId: deckId as Id<"decks">,
        versionId: versionId as Id<"deckVersions">,
      })
      if (this.superseded(deckId, ordinal, epoch)) return
      if (read.version.deckId === deckId)
        this.repository.saveCards(versionId, read.version.revision, read.cards)
      this.publish(deckId)
    } catch {
      // Offline: the cached snapshot published by ensure() stands.
    } finally {
      if (this.inFlight.get(key) === epoch) this.inFlight.delete(key)
    }
  }

  private async pullVersions(
    deckId: string,
    epoch: number,
    ordinal: number,
  ): Promise<CachedVersion[]> {
    const merged: CachedVersion[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_VERSION_PAGES; page++) {
      const result: VersionsPage = await this.client.query(api.decks.versionsPull, {
        deckId: deckId as Id<"decks">,
        paginationOpts: { cursor, numItems: VERSION_PAGE_SIZE },
      })
      if (this.superseded(deckId, ordinal, epoch)) return []
      if (result.deckId !== deckId) throw new Error("Version list for another deck")
      merged.push(...result.page)
      if (result.isDone) return this.repository.mergeVersions(deckId, merged, true)
      cursor = result.continueCursor
    }
    // Incomplete: the newest pages are merged, but nothing is reconciled away.
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

  private publish(deckId: string): void {
    const selectedVersionId = this.wanted.get(deckId)
    const versions = this.repository.loadVersions(deckId)
    const version = selectedVersionId
      ? versions.find((candidate) => candidate.versionId === selectedVersionId)
      : this.latestActive(versions)
    const cards = this.renderableCards(version)
    const next = new Map(this.snapshot)
    next.set(deckId, { versions, version, cards })
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
  const connection = useConvexConnectionState()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckVersionCacheController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => controller?.start(), [controller])
  const wasConnected = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    const connected = connection?.isWebSocketConnected
    if (controller && connected && wasConnected.current === false) controller.resume()
    wasConnected.current = connected
    controller?.ensure(deckId, selectedVersionId)
  }, [controller, deckId, selectedVersionId, connection?.isWebSocketConnected])
  const record = useCallback(
    (versionId: string, revision: number, cards: readonly StorableVersionCard[]) =>
      controller?.record(deckId, versionId, revision, cards),
    [controller, deckId],
  )
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noSubscribers,
    () => controller?.getSnapshot().get(deckId) ?? emptySnapshot,
    () => emptySnapshot,
  )
  return { ...snapshot, record }
}
