import { useCallback, useEffect, useMemo, useRef } from "react"
import { internal, observable, setAtPath } from "@legendapp/state"
import type { Change, Observable, ObservableParam } from "@legendapp/state"
import { useSelector } from "@legendapp/state/react"
import { syncObservable } from "@legendapp/state/sync"
import {
  type ObservablePersistPlugin,
  type PersistMetadata,
  type PersistOptions,
} from "@legendapp/state/sync"
import { useConvex, useConvexConnectionState, type ConvexReactClient } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { DeckCard } from "@/features/decks/deckCards"
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

export interface DeckVersionCacheStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

export interface DeckVersionCacheSnapshot {
  versions: StoredVersion[]
  version: StoredVersion | undefined
  cards: StorableVersionCard[] | undefined
  capacity?: DeckVersionCapacityHint
}

interface StoredVersions {
  schemaVersion: 1
  versions: StoredVersion[]
}

interface StoredCards {
  schemaVersion: 1
  revision: number
  cards: StorableVersionCard[]
}

interface StoredCapacity {
  schemaVersion: 1
  limit: number
  premium: boolean
}

interface StoredVersionIdMap {
  schemaVersion: 1
  versionId: string
}

function versionsKey(ownerId: string, deploymentUrl: string | undefined, deckId: string) {
  return `scryve.decks.versionList.v1.${scopedOwnerId(ownerId, deploymentUrl)}.${deckId}`
}

function cardsKey(ownerId: string, deploymentUrl: string | undefined, versionId: string) {
  return `scryve.decks.versionCards.v1.${scopedOwnerId(ownerId, deploymentUrl)}.${versionId}`
}

function capacityKey(ownerId: string, deploymentUrl: string | undefined, deckId: string) {
  return `scryve.decks.versionCapacity.v1.${scopedOwnerId(ownerId, deploymentUrl)}.${deckId}`
}

function versionMapKey(ownerId: string, deploymentUrl: string | undefined, versionId: string) {
  return `scryve.decks.versionIdMap.v1.${scopedOwnerId(ownerId, deploymentUrl)}.${versionId}`
}

function knownCardsKey(ownerId: string, deploymentUrl: string | undefined) {
  return `scryve.decks.knownCards.v1.${scopedOwnerId(ownerId, deploymentUrl)}`
}

/** Printable identity of a card, independent of the deck slot it was cached in. */
function cardIdentity(
  card: Pick<
    DeckCard,
    | "printingId"
    | "providerCardId"
    | "scryfallId"
    | "cardId"
    | "oracleId"
    | "originalReference"
    | "name"
  >,
) {
  return (
    card.printingId ??
    card.providerCardId ??
    card.scryfallId ??
    card.cardId ??
    card.oracleId ??
    card.originalReference ??
    card.name
  )
}

/**
 * A cached card is addable offline only when the server would accept it: identity beyond
 * a bare name is present, so this row descends from a server card rather than a draft.
 */
function hasCompleteIdentity(card: StorableVersionCard) {
  return Boolean(
    card.printingId ||
    card.providerCardId ||
    card.scryfallId ||
    card.cardId ||
    card.oracleId ||
    card.originalReference,
  )
}

/**
 * A fully-identified cached card this account has seen, aggregated across every deck's
 * cached versions. Offline adds are offered only out of this index; key is the card
 * identity (without section, so sideboard copies cover maindeck adds).
 */
export interface KnownCardEntry {
  game: string | undefined
  card: StorableVersionCard
}

interface StoredKnownCards {
  schemaVersion: 1
  cards: Record<string, KnownCardEntry>
}

export interface DeckVersionCapacityHint {
  limit: number
  premium: boolean
}

/**
 * A version row stored locally that the server does not know yet. Confirmed server rows
 * never carry `local`, so tombstone refreshes never drop a pending offline draft.
 */
export type StoredVersion = CachedVersion & { local?: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

function parseJson(value: string | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
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

function isCapacityHint(value: unknown): value is DeckVersionCapacityHint {
  return isRecord(value) && isCount(value.limit) && typeof value.premium === "boolean"
}

/**
 * Persist plugin writing observable values to a string store keyed as whole JSON payloads.
 * Keys and payloads are byte-identical with the classic repository layout, so existing
 * installs upgrade without a migration step. One plugin instance serves all observables;
 * the storage backend arrives per-node through persist options.
 */
class ObservableStringStoragePersistence implements ObservablePersistPlugin {
  private readonly cache = new Map<DeckVersionCacheStorage, Record<string, unknown>>()

  private byTable(config: PersistOptions) {
    const local = config.options.storage as DeckVersionCacheStorage
    let table = this.cache.get(local)
    if (!table) {
      table = {}
      this.cache.set(local, table)
    }
    return { local, table }
  }

  /**
   * v3 loads local state asynchronously, but every persisted node is seeded from its
   * storage key at creation (persistedNode), so the deferred load only re-reads what the
   * node already holds. Returning the tracked current value keeps the load a no-op and
   * stops a stale storage snapshot from clobbering newer writes.
   */
  getTable<T>(table: string, init: object, _config: PersistOptions): T {
    void table
    return init as T
  }

  set(table: string, changes: Change[], config: PersistOptions): void {
    const { local, table: byTable } = this.byTable(config)
    for (const { path, valueAtPath, pathTypes } of changes) {
      if (path.length === 0) {
        byTable[table] = internal.symbolDelete === valueAtPath ? undefined : valueAtPath
      } else {
        const base = (byTable[table] ?? {}) as object
        byTable[table] = setAtPath(base, path, pathTypes, valueAtPath) as Record<string, unknown>
      }
    }
    this.save(table, local, byTable)
  }

  deleteTable(table: string, config: PersistOptions): void {
    const { local, table: byTable } = this.byTable(config)
    delete byTable[table]
    local.delete(table)
  }

  /** Local-only persistence needs no metadata; no-op keeps storage byte-identical. */
  getMetadata(): PersistMetadata {
    return {}
  }

  setMetadata(): void {}

  deleteMetadata(): void {}

  private save(
    table: string,
    local: DeckVersionCacheStorage,
    byTable: Record<string, unknown>,
  ): void {
    const value = byTable[table]
    if (value === undefined || value === internal.symbolDelete) {
      delete byTable[table]
      local.delete(table)
    } else {
      try {
        local.set(table, JSON.stringify(value))
      } catch (error) {
        console.error("[deck-version-cache] failed to persist", table, error)
      }
    }
  }
}

/** Shared owner identity for cache entries; key scoping lives in the key builders. */
interface CacheContext {
  readonly ownerId: string
  readonly local: DeckVersionCacheStorage
  readonly deploymentUrl?: string
}

interface NodeRegistries {
  versionList: Map<string, Observable<StoredVersions>>
  versionCards: Map<string, Observable<StoredCards>>
  capacity: Map<string, Observable<StoredCapacity>>
  versionIdMap: Map<string, Observable<StoredVersionIdMap>>
  knownCards: Map<string, Observable<StoredKnownCards>>
}

const nodeRegistries = new WeakMap<DeckVersionCacheStorage, NodeRegistries>()

function nodesFor(context: CacheContext) {
  let registry = nodeRegistries.get(context.local)
  if (!registry) {
    registry = {
      versionList: new Map(),
      versionCards: new Map(),
      capacity: new Map(),
      versionIdMap: new Map(),
      knownCards: new Map(),
    }
    nodeRegistries.set(context.local, registry)
  }
  return registry
}

// ponytail: one node per storage key, alive for the app session; evict only if profiling
// shows long sessions over many decks pressing the memory budget
function persistedNode<T>(
  registry: Map<string, Observable<T>>,
  key: string,
  context: CacheContext,
  init: () => unknown,
): Observable<T> {
  let node = registry.get(key)
  if (!node) {
    // Seed synchronously from storage so reads are correct the moment the node exists;
    // v3's async local load re-enters through getTable and changes nothing.
    const nodeValue = parseJson(context.local.getString(key)) ?? init()
    node = observable(nodeValue) as unknown as Observable<T>
    syncObservable(node as ObservableParam<T>, {
      persist: {
        name: key,
        plugin: stringStoragePersistence,
        options: { storage: context.local },
      },
    })
    registry.set(key, node)
  }
  return node
}

/** One plugin instance serves all observables; the storage backend arrives per-node options. */
const stringStoragePersistence = new ObservableStringStoragePersistence()

function versionsNode(context: CacheContext, deckId: string) {
  return persistedNode(
    nodesFor(context).versionList,
    versionsKey(context.ownerId, context.deploymentUrl, deckId),
    context,
    () => ({}),
  )
}

function cardsNode(context: CacheContext, versionId: string) {
  return persistedNode(
    nodesFor(context).versionCards,
    cardsKey(context.ownerId, context.deploymentUrl, versionId),
    context,
    () => ({}),
  )
}

function capacityNode(context: CacheContext, deckId: string) {
  return persistedNode(
    nodesFor(context).capacity,
    capacityKey(context.ownerId, context.deploymentUrl, deckId),
    context,
    () => ({}),
  )
}

function versionIdMapNode(context: CacheContext, provisionalId: string) {
  return persistedNode(
    nodesFor(context).versionIdMap,
    versionMapKey(context.ownerId, context.deploymentUrl, provisionalId),
    context,
    () => ({}),
  )
}

function knownCardsNode(context: CacheContext) {
  return persistedNode(
    nodesFor(context).knownCards,
    knownCardsKey(context.ownerId, context.deploymentUrl),
    context,
    () => ({ cards: {} }),
  )
}

/** Public alias for the printing identity key challenging the known-cards index. */
export const cachedCardIdentity = cardIdentity

export class DeckVersionCacheRepository {
  constructor(
    readonly ownerId: string,
    private readonly local: DeckVersionCacheStorage = storage,
    private readonly deploymentUrl?: string,
  ) {}

  private context(): CacheContext {
    return { ownerId: this.ownerId, local: this.local, deploymentUrl: this.deploymentUrl }
  }

  /** Last known server capacity for the deck guides offline creation; server stays authoritative. */
  saveCapacity(deckId: string, capacity: DeckVersionCapacityHint): void {
    capacityNode(this.context(), deckId).set({
      schemaVersion: 1,
      limit: capacity.limit,
      premium: capacity.premium,
    } satisfies StoredCapacity)
  }

  loadCapacity(deckId: string): DeckVersionCapacityHint | undefined {
    const value = capacityNode(this.context(), deckId).get()
    return isCapacityHint(value) ? { limit: value.limit, premium: value.premium } : undefined
  }

  loadVersions(deckId: string): StoredVersion[] {
    const value = versionsNode(this.context(), deckId).get() as unknown
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
    incoming: readonly StoredVersion[],
    complete = false,
  ): StoredVersion[] {
    const byId = new Map(this.loadVersions(deckId).map((version) => [version.versionId, version]))
    for (const version of incoming) {
      const current = byId.get(version.versionId)
      if (!current || version.revision >= current.revision) byId.set(version.versionId, version)
    }
    const dropped = new Set<string>()
    const versions = [...byId.values()].filter((version) => {
      if (version.local) return true
      if (version.deleted) {
        dropped.add(version.versionId)
        return false
      }
      return true
    })
    if (complete) {
      const authoritative = new Set(incoming.map((version) => version.versionId))
      for (let index = versions.length - 1; index >= 0; index--) {
        if (authoritative.has(versions[index].versionId) || versions[index].local) continue
        dropped.add(versions[index].versionId)
        versions.splice(index, 1)
      }
    }
    for (const versionId of dropped) cardsNode(this.context(), versionId).delete()
    versionsNode(this.context(), deckId).set({
      schemaVersion: 1,
      versions: [...versions],
    } satisfies StoredVersions)
    return versions
  }

  /** Any invalid card invalidates the whole payload: reads never partially accept. */
  loadCards(versionId: string): StoredCards | undefined {
    const value = cardsNode(this.context(), versionId).get() as unknown
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
    cardsNode(this.context(), versionId).set(stored)
    this.indexCards(stored.cards)
    return stored
  }

  /**
   * Aggregates fully-identified cards into the account's known-cards index. First
   * complete-identity entry wins per card identity; identity-poor rows (legacy payloads
   * cached before enrichment) are never indexed, so they stay unaddable offline.
   */
  indexCards(cards: readonly StorableVersionCard[]): void {
    const node = knownCardsNode(this.context())
    const stored: StoredKnownCards = { schemaVersion: 1, cards: { ...node.peek().cards } }
    let changed = false
    for (const card of cards) {
      if (!hasCompleteIdentity(card)) continue
      const identity = cardIdentity(card)
      if (stored.cards[identity]) continue
      stored.cards[identity] = { game: card.game, card }
      changed = true
    }
    if (changed) node.set(stored)
  }

  /** Addable cards this account already has cached, keyed by card identity. */
  loadKnownCards(): Record<string, KnownCardEntry> {
    const node = knownCardsNode(this.context())
    const value = node.peek() as unknown
    return isRecord(value) && isRecord(value.cards)
      ? (value.cards as StoredKnownCards["cards"])
      : {}
  }

  bumpVersion(deckId: string, versionId: string, revision: number): void {
    const versions = this.loadVersions(deckId)
    const current = versions.find((version) => version.versionId === versionId)
    const stored = this.loadCards(versionId)
    if (!current || current.revision >= revision || !stored) return
    this.replaceVersions(
      deckId,
      versions.map((version) =>
        version.versionId === versionId
          ? {
              ...version,
              revision,
              cardCount: stored.cards.length,
              cardQuantity: stored.cards.reduce((total, card) => total + card.quantity, 0),
            }
          : version,
      ),
    )
  }

  private replaceVersions(deckId: string, versions: readonly StoredVersion[]): void {
    versionsNode(this.context(), deckId).set({
      schemaVersion: 1,
      versions: [...versions],
    } satisfies StoredVersions)
  }

  /** Registers an offline draft version so it renders before and while the create is queued. */
  saveDraft(deckId: string, draft: StoredVersion): void {
    const versions = this.loadVersions(deckId)
    this.replaceVersions(deckId, [...versions, draft])
  }

  /** Swaps a created draft for its confirmed server row, dropping the draft's card payload. */
  confirmDraft(deckId: string, provisionalId: string, confirmed: StoredVersion): void {
    const versions = this.loadVersions(deckId)
    const draft = versions.find((version) => version.versionId === provisionalId)
    const fallback = draft ? { ...confirmed, versionNumber: draft.versionNumber } : confirmed
    cardsNode(this.context(), provisionalId).delete()
    this.replaceVersions(
      deckId,
      versions.filter((version) => version.versionId !== provisionalId),
    )
    this.mergeVersions(deckId, [fallback])
  }

  /** Discards a draft version and its card payload after a failed or cancelled create. */
  discardDraft(deckId: string, provisionalId: string): void {
    cardsNode(this.context(), provisionalId).delete()
    versionIdMapNode(this.context(), provisionalId).delete()
    this.replaceVersions(
      deckId,
      this.loadVersions(deckId).filter((version) => version.versionId !== provisionalId),
    )
  }

  /** Durable identity map from a local provisional version id to its real server id. */
  recordMapping(provisionalId: string, versionId: string): void {
    versionIdMapNode(this.context(), provisionalId).set({
      schemaVersion: 1,
      versionId,
    } satisfies StoredVersionIdMap)
  }

  /** Raw local id a provisional id was acknowledged as, without needing the deck row. */
  mappedVersionId(provisionalId: string): string | undefined {
    const value = versionIdMapNode(this.context(), provisionalId).get() as unknown
    return isRecord(value) && typeof value.versionId === "string" ? value.versionId : undefined
  }

  /** Row for a provisional id once the server has acknowledged the create. */
  resolveMapped(deckId: string, provisionalId: string): StoredVersion | undefined {
    const mapped = this.mappedVersionId(provisionalId)
    return mapped
      ? this.loadVersions(deckId).find((version) => version.versionId === mapped)
      : undefined
  }
}

const VERSION_PAGE_SIZE = 100
// ponytail: decks hold a handful of versions today; 10 pages is a runaway-fetch guard
const MAX_VERSION_PAGES = 10

export class DeckVersionCacheController {
  /** Tracked selection so ensure() re-renders reacting consumers immediately. */
  private readonly wanted$ = observable({} as Record<string, string | undefined>)
  private inFlight = new Map<string, number>()
  private decks = new Map<string, number>()
  private readonly known = new Set<string>()
  private users = 0
  private epoch = 0

  constructor(
    private readonly client: Pick<ConvexReactClient, "query">,
    private readonly repository: DeckVersionCacheRepository,
  ) {}

  start(): () => void {
    this.users += 1
    return () => {
      this.users = Math.max(0, this.users - 1)
      if (this.users > 0) return
      this.epoch += 1
      this.inFlight.clear()
      this.wanted$.set({})
      this.decks.clear()
    }
  }

  /** Snapshot map for the decks this controller has viewed; reads are synchronous. */
  getSnapshot = (): Map<string, DeckVersionCacheSnapshot> =>
    new Map([...this.known].map((deckId) => [deckId, this.snapshot(deckId)]))

  /**
   * Derived snapshot: recomputed on read, with Legend tracking every observable it touches
   * so screens re-render through useRouterState-equivalent hooks (useSelector).
   */
  private wantedAt(deckId: string): string | undefined {
    return this.wanted$[deckId].get()
  }

  snapshot(deckId: string): DeckVersionCacheSnapshot {
    return this.renderSnapshot(deckId)
  }

  /** Publishes the cached snapshot immediately, then refreshes from the server once. */
  ensure(deckId: string, selectedVersionId: string | undefined): void {
    if (this.users === 0) return
    this.wanted$[deckId].set(selectedVersionId)
    this.known.add(deckId)
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
  }

  /** Keeps the last server-known version capacity as the offline creation hint. */
  recordCapacity(deckId: string, capacity: DeckVersionCapacityHint): void {
    if (this.users === 0) return
    this.repository.saveCapacity(deckId, capacity)
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
      const versionId = this.wantedAt(deckId) ?? this.latestActive(versions)?.versionId
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

  private renderSnapshot(deckId: string): DeckVersionCacheSnapshot {
    const selectedVersionId = this.wantedAt(deckId)
    const versions = this.repository.loadVersions(deckId)
    const direct = selectedVersionId
      ? versions.find((candidate) => candidate.versionId === selectedVersionId)
      : undefined
    const mapped = selectedVersionId
      ? this.repository.resolveMapped(deckId, selectedVersionId)
      : undefined
    // A mapped draft resolves to its confirmed server row; before the create acks the draft stands.
    const version = selectedVersionId
      ? direct?.local
        ? (mapped ?? direct)
        : (direct ?? mapped)
      : this.latestActive(versions)
    const cards = this.renderableCards(version)
    return {
      versions,
      version,
      cards,
      capacity: this.repository.loadCapacity(deckId),
    }
  }

  private renderableCards(version: CachedVersion | undefined) {
    if (!version || version.deleted) return undefined
    const stored = this.repository.loadCards(version.versionId)
    if (!stored || stored.revision < version.revision) return undefined
    return stored.cards
  }

  /** Cards the account has fully cached, keyed by card identity. */
  knownCards(): Record<string, KnownCardEntry> {
    return this.repository.loadKnownCards()
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
  capacity: undefined,
}

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
  const recordCapacity = useCallback(
    (capacity: DeckVersionCapacityHint) => controller?.recordCapacity(deckId, capacity),
    [controller, deckId],
  )
  const refresh = useCallback(
    () => controller?.ensure(deckId, selectedVersionId),
    [controller, deckId, selectedVersionId],
  )
  const snapshot = useSelector(() => (controller ? controller.snapshot(deckId) : emptySnapshot))
  const knownCards = useSelector(() => controller?.knownCards() ?? {})
  return { ...snapshot, knownCards, record, recordCapacity, refresh }
}
