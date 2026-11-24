import { onStorageClear, storage } from "@/utils/storage"

import type {
  BinderKind,
  CardDetailUpsert,
  LocalCardDb,
  StoredBinder,
  StoredCardDetailRow,
  StoredCollectionEntry,
  StoredGuestDeckRow,
} from "./localDbTypes"

// why: web avoids expo-sqlite's WASM/OPFS COOP+COEP headers (which break Clerk, Stripe, and card images) and keeps synchronous cross-tab durability over browser storage.
const GUEST_DECK_PREFIX = "scryve.cardDb.guestDeck.v1."
const GUEST_META_PREFIX = "scryve.cardDb.guestMeta.v1."
const BINDER_PREFIX = "scryve.cardDb.binder.v1."
const COLLECTION_PREFIX = "scryve.cardDb.collection.v1."
const DETAILS_MAP_KEY = "scryve.cardDb.cardDetails.v1"

let detailsRevision = 0

function createdAtOf(payload: string): number {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { createdAt?: unknown }).createdAt === "number"
    ) {
      return (parsed as { createdAt: number }).createdAt
    }
  } catch {}
  return Number.MAX_SAFE_INTEGER
}

function readDetailsRecord(): Record<string, { payload: string; accessedAt: number }> {
  const raw = storage.getString(DETAILS_MAP_KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}
    const out: Record<string, { payload: string; accessedAt: number }> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { payload?: unknown }).payload === "string" &&
        typeof (value as { accessedAt?: unknown }).accessedAt === "number"
      ) {
        out[key] = value as { payload: string; accessedAt: number }
      }
    }
    return out
  } catch {
    return {}
  }
}

export const localCardDb: LocalCardDb = {
  sharesLegacyStorage: true,

  getKv(key) {
    return storage.getString(key)
  },

  setKv(key, value) {
    storage.set(key, value)
  },

  deleteKv(key) {
    storage.remove(key)
  },

  getAllKvKeys() {
    return storage.getAllKeys()
  },

  listGuestDecks(): StoredGuestDeckRow[] {
    const rows: { localId: string; payload: string; createdAt: number }[] = []
    for (const key of storage.getAllKeys()) {
      if (!key.startsWith(GUEST_DECK_PREFIX)) continue
      const localId = key.slice(GUEST_DECK_PREFIX.length)
      const payload = storage.getString(key)
      if (payload !== undefined) rows.push({ localId, payload, createdAt: createdAtOf(payload) })
    }
    rows.sort(
      (left, right) =>
        left.createdAt - right.createdAt || left.localId.localeCompare(right.localId),
    )
    return rows.map(({ localId, payload }) => ({ localId, payload }))
  },

  upsertGuestDeck(localId, _deckKey, _updatedAt, payload) {
    storage.set(`${GUEST_DECK_PREFIX}${localId}`, payload)
  },

  deleteGuestDeck(localId) {
    storage.remove(`${GUEST_DECK_PREFIX}${localId}`)
  },

  clearGuestDecks() {
    for (const key of storage.getAllKeys()) {
      if (key.startsWith(GUEST_DECK_PREFIX) || key.startsWith(GUEST_META_PREFIX)) {
        storage.remove(key)
      }
    }
  },

  getGuestMeta(key) {
    return storage.getString(`${GUEST_META_PREFIX}${key}`)
  },

  setGuestMeta(key, value) {
    storage.set(`${GUEST_META_PREFIX}${key}`, value)
  },

  deleteGuestMeta(key) {
    storage.remove(`${GUEST_META_PREFIX}${key}`)
  },

  listCardDetails(): StoredCardDetailRow[] {
    return Object.entries(readDetailsRecord())
      .sort(([, left], [, right]) => left.accessedAt - right.accessedAt)
      .map(([key, entry]) => ({ key, payload: entry.payload }))
  },

  getCardDetail(key) {
    return readDetailsRecord()[key]?.payload
  },

  upsertCardDetails(entries: readonly CardDetailUpsert[], maxEntries: number) {
    if (entries.length === 0) return
    const record = readDetailsRecord()
    for (const entry of entries) {
      record[entry.key] = { payload: entry.payload, accessedAt: entry.accessedAt }
    }
    const sorted = Object.entries(record).sort(
      ([, left], [, right]) => right.accessedAt - left.accessedAt,
    )
    const trimmed = Object.fromEntries(sorted.slice(0, maxEntries))
    storage.set(DETAILS_MAP_KEY, JSON.stringify(trimmed))
    detailsRevision += 1
  },

  clearCardDetails() {
    storage.remove(DETAILS_MAP_KEY)
    detailsRevision += 1
  },

  cardDetailsRevision() {
    return detailsRevision
  },

  listBinders(kind?: BinderKind): StoredBinder[] {
    const binders: StoredBinder[] = []
    for (const key of storage.getAllKeys()) {
      if (!key.startsWith(BINDER_PREFIX)) continue
      const raw = storage.getString(key)
      if (!raw) continue
      try {
        const binder = JSON.parse(raw) as StoredBinder
        if (binder.archivedAt !== undefined) continue
        if (kind && binder.kind !== kind) continue
        binders.push(binder)
      } catch {}
    }
    return binders.sort((left, right) => right.updatedAt - left.updatedAt)
  },

  upsertBinder(binder) {
    storage.set(`${BINDER_PREFIX}${binder.id}`, JSON.stringify(binder))
  },

  deleteBinder(id) {
    storage.delete(`${BINDER_PREFIX}${id}`)
    for (const entry of this.listCollectionEntries({ binderId: id, includeDeleted: true })) {
      storage.delete(`${COLLECTION_PREFIX}${entry.id}`)
    }
  },

  listCollectionEntries(filter = {}): StoredCollectionEntry[] {
    const entries: StoredCollectionEntry[] = []
    for (const key of storage.getAllKeys()) {
      if (!key.startsWith(COLLECTION_PREFIX)) continue
      const raw = storage.getString(key)
      if (!raw) continue
      try {
        const entry = JSON.parse(raw) as StoredCollectionEntry
        if (!filter.includeDeleted && entry.deletedAt !== undefined) continue
        if (filter.game && entry.game !== filter.game) continue
        if (filter.binderId === null && entry.binderId !== undefined) continue
        if (
          filter.binderId !== undefined &&
          filter.binderId !== null &&
          entry.binderId !== filter.binderId
        )
          continue
        if (filter.cardId && entry.cardId !== filter.cardId) continue
        entries.push(entry)
      } catch {}
    }
    return entries.sort((left, right) => right.updatedAt - left.updatedAt)
  },

  upsertCollectionEntry(entry) {
    storage.set(`${COLLECTION_PREFIX}${entry.id}`, JSON.stringify(entry))
  },

  upsertCollectionEntries(entries) {
    for (const entry of entries) this.upsertCollectionEntry(entry)
  },

  deleteCollectionEntry(id, deletedAt) {
    const raw = storage.getString(`${COLLECTION_PREFIX}${id}`)
    if (!raw) return
    try {
      const entry = JSON.parse(raw) as StoredCollectionEntry
      storage.set(
        `${COLLECTION_PREFIX}${id}`,
        JSON.stringify({ ...entry, deletedAt, updatedAt: deletedAt }),
      )
    } catch {}
  },

  ownedQuantitiesByCardId(game, cardIds) {
    const wanted = new Set(cardIds)
    const counts = new Map<string, number>()
    for (const entry of this.listCollectionEntries({ game })) {
      if (!wanted.has(entry.cardId)) continue
      counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.quantity)
    }
    return counts
  },

  transaction(run) {
    run()
  },

  clearAll() {
    this.clearGuestDecks()
    this.clearCardDetails()
    for (const key of storage.getAllKeys()) {
      if (key.startsWith(BINDER_PREFIX) || key.startsWith(COLLECTION_PREFIX)) {
        storage.delete(key)
      }
    }
  },
}

onStorageClear(() => {
  detailsRevision += 1
})
