import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite"

import { onStorageClear } from "@/utils/storage"

import type {
  BinderKind,
  CardDetailUpsert,
  LocalCardDb,
  StoredBinder,
  StoredCardDetailRow,
  StoredCollectionEntry,
  StoredGuestDeckRow,
} from "./localDbTypes"

const DATABASE_NAME = "scryve-cards.db"
const SCHEMA_VERSION = 2

let cachedDb: SQLiteDatabase | undefined
let detailsRevision = 0

function openNativeDb(): SQLiteDatabase {
  if (cachedDb) return cachedDb
  const db = openDatabaseSync(DATABASE_NAME)
  db.execSync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;")
  const versionRow = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
  const version = versionRow?.user_version ?? 0
  if (version < SCHEMA_VERSION) {
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS kv_entries (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS guest_decks (
          local_id TEXT PRIMARY KEY NOT NULL,
          deck_key TEXT,
          updated_at INTEGER NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS guest_deck_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS card_details (
          detail_key TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          accessed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_card_details_accessed_at
          ON card_details (accessed_at DESC);
        CREATE TABLE IF NOT EXISTS binders (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          game TEXT,
          default_set_code TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_binders_kind_updated
          ON binders (kind, updated_at DESC);
        CREATE TABLE IF NOT EXISTS collection_entries (
          id TEXT PRIMARY KEY NOT NULL,
          game TEXT NOT NULL,
          card_id TEXT NOT NULL,
          printing_id TEXT NOT NULL,
          name TEXT NOT NULL,
          set_code TEXT NOT NULL,
          collector_number TEXT NOT NULL,
          finish TEXT NOT NULL,
          condition TEXT NOT NULL,
          language TEXT NOT NULL,
          edition TEXT,
          quantity INTEGER NOT NULL,
          binder_id TEXT,
          acquired_cents INTEGER,
          notes TEXT,
          image_url TEXT,
          small_image_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_collection_game_card
          ON collection_entries (game, card_id);
        CREATE INDEX IF NOT EXISTS idx_collection_binder
          ON collection_entries (binder_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_collection_printing
          ON collection_entries (game, printing_id, finish, condition, language, binder_id);
      `)
      db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    })
  }
  cachedDb = db
  return db
}

interface RawBinderRow {
  id: string
  kind: BinderKind
  name: string
  game: string | null
  default_set_code: string | null
  created_at: number
  updated_at: number
  archived_at: number | null
}

interface RawCollectionEntryRow {
  id: string
  game: string
  card_id: string
  printing_id: string
  name: string
  set_code: string
  collector_number: string
  finish: string
  condition: string
  language: string
  edition: string | null
  quantity: number
  binder_id: string | null
  acquired_cents: number | null
  notes: string | null
  image_url: string | null
  small_image_url: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

function hydrateBinder(row: RawBinderRow): StoredBinder {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    ...(row.game ? { game: row.game } : {}),
    ...(row.default_set_code ? { defaultSetCode: row.default_set_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.archived_at !== null ? { archivedAt: row.archived_at } : {}),
  }
}

function hydrateCollectionEntry(row: RawCollectionEntryRow): StoredCollectionEntry {
  return {
    id: row.id,
    game: row.game,
    cardId: row.card_id,
    printingId: row.printing_id,
    name: row.name,
    setCode: row.set_code,
    collectorNumber: row.collector_number,
    finish: row.finish,
    condition: row.condition,
    language: row.language,
    ...(row.edition ? { edition: row.edition } : {}),
    quantity: row.quantity,
    ...(row.binder_id ? { binderId: row.binder_id } : {}),
    ...(row.acquired_cents !== null ? { acquiredCents: row.acquired_cents } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.small_image_url ? { smallImageUrl: row.small_image_url } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at !== null ? { deletedAt: row.deleted_at } : {}),
  }
}

export function resetLocalCardDbConnection() {
  if (cachedDb) {
    try {
      cachedDb.closeSync()
    } catch {}
    cachedDb = undefined
  }
}

export const localCardDb: LocalCardDb = {
  sharesLegacyStorage: false,
  getKv(key) {
    const row = openNativeDb().getFirstSync<{ value: string }>(
      "SELECT value FROM kv_entries WHERE key = ?",
      [key],
    )
    return row?.value
  },

  setKv(key, value) {
    openNativeDb().runSync(
      "INSERT OR REPLACE INTO kv_entries (key, value, updated_at) VALUES (?, ?, ?)",
      [key, value, Date.now()],
    )
  },

  deleteKv(key) {
    openNativeDb().runSync("DELETE FROM kv_entries WHERE key = ?", [key])
  },

  getAllKvKeys() {
    return openNativeDb()
      .getAllSync<{ key: string }>("SELECT key FROM kv_entries")
      .map((row) => row.key)
  },

  listGuestDecks() {
    return openNativeDb().getAllSync<StoredGuestDeckRow>(
      "SELECT local_id AS localId, payload FROM guest_decks ORDER BY rowid ASC",
    )
  },

  upsertGuestDeck(localId, deckKey, updatedAt, payload) {
    openNativeDb().runSync(
      `INSERT INTO guest_decks (local_id, deck_key, updated_at, payload)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(local_id) DO UPDATE SET
         deck_key = excluded.deck_key,
         updated_at = excluded.updated_at,
         payload = excluded.payload`,
      [localId, deckKey ?? null, updatedAt, payload],
    )
  },

  deleteGuestDeck(localId) {
    openNativeDb().runSync("DELETE FROM guest_decks WHERE local_id = ?", [localId])
  },

  clearGuestDecks() {
    const db = openNativeDb()
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM guest_decks")
      db.runSync("DELETE FROM guest_deck_meta")
    })
  },

  getGuestMeta(key) {
    const row = openNativeDb().getFirstSync<{ value: string }>(
      "SELECT value FROM guest_deck_meta WHERE key = ?",
      [key],
    )
    return row?.value
  },

  setGuestMeta(key, value) {
    openNativeDb().runSync("INSERT OR REPLACE INTO guest_deck_meta (key, value) VALUES (?, ?)", [
      key,
      value,
    ])
  },

  deleteGuestMeta(key) {
    openNativeDb().runSync("DELETE FROM guest_deck_meta WHERE key = ?", [key])
  },

  listCardDetails() {
    return openNativeDb().getAllSync<StoredCardDetailRow>(
      "SELECT detail_key AS key, payload FROM card_details ORDER BY accessed_at ASC, rowid ASC",
    )
  },

  getCardDetail(key) {
    const row = openNativeDb().getFirstSync<{ payload: string }>(
      "SELECT payload FROM card_details WHERE detail_key = ?",
      [key],
    )
    return row?.payload
  },

  upsertCardDetails(entries: readonly CardDetailUpsert[], maxEntries: number) {
    if (entries.length === 0) return
    const db = openNativeDb()
    db.withTransactionSync(() => {
      for (const entry of entries) {
        db.runSync(
          "INSERT OR REPLACE INTO card_details (detail_key, payload, accessed_at) VALUES (?, ?, ?)",
          [entry.key, entry.payload, entry.accessedAt],
        )
      }
      db.runSync(
        `DELETE FROM card_details
         WHERE detail_key IN (
           SELECT detail_key FROM card_details
           ORDER BY accessed_at DESC, rowid DESC
           LIMIT -1 OFFSET ?
         )`,
        [maxEntries],
      )
    })
    detailsRevision += 1
  },

  clearCardDetails() {
    openNativeDb().runSync("DELETE FROM card_details")
    detailsRevision += 1
  },

  cardDetailsRevision() {
    return detailsRevision
  },

  listBinders(kind) {
    const db = openNativeDb()
    const rows = kind
      ? db.getAllSync<RawBinderRow>(
          "SELECT * FROM binders WHERE kind = ? AND archived_at IS NULL ORDER BY updated_at DESC",
          [kind],
        )
      : db.getAllSync<RawBinderRow>(
          "SELECT * FROM binders WHERE archived_at IS NULL ORDER BY updated_at DESC",
        )
    return rows.map(hydrateBinder)
  },

  upsertBinder(binder) {
    openNativeDb().runSync(
      `INSERT OR REPLACE INTO binders (
        id, kind, name, game, default_set_code, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        binder.id,
        binder.kind,
        binder.name,
        binder.game ?? null,
        binder.defaultSetCode ?? null,
        binder.createdAt,
        binder.updatedAt,
        binder.archivedAt ?? null,
      ],
    )
  },

  deleteBinder(id) {
    const db = openNativeDb()
    const run = () => {
      db.runSync("DELETE FROM collection_entries WHERE binder_id = ?", [id])
      db.runSync("DELETE FROM binders WHERE id = ?", [id])
    }
    if (db.isInTransactionSync()) run()
    else db.withTransactionSync(run)
  },

  listCollectionEntries(filter = {}) {
    const clauses: string[] = []
    const params: (string | number)[] = []
    if (!filter.includeDeleted) clauses.push("deleted_at IS NULL")
    if (filter.game) {
      clauses.push("game = ?")
      params.push(filter.game)
    }
    if (filter.binderId === null) {
      clauses.push("binder_id IS NULL")
    } else if (filter.binderId !== undefined) {
      clauses.push("binder_id = ?")
      params.push(filter.binderId)
    }
    if (filter.cardId) {
      clauses.push("card_id = ?")
      params.push(filter.cardId)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""
    return openNativeDb()
      .getAllSync<RawCollectionEntryRow>(
        `SELECT * FROM collection_entries ${where} ORDER BY updated_at DESC`,
        params,
      )
      .map(hydrateCollectionEntry)
  },

  upsertCollectionEntry(entry) {
    openNativeDb().runSync(
      `INSERT OR REPLACE INTO collection_entries (
        id, game, card_id, printing_id, name, set_code, collector_number,
        finish, condition, language, edition, quantity, binder_id,
        acquired_cents, notes, image_url, small_image_url, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.game,
        entry.cardId,
        entry.printingId,
        entry.name,
        entry.setCode,
        entry.collectorNumber,
        entry.finish,
        entry.condition,
        entry.language,
        entry.edition ?? null,
        entry.quantity,
        entry.binderId ?? null,
        entry.acquiredCents ?? null,
        entry.notes ?? null,
        entry.imageUrl ?? null,
        entry.smallImageUrl ?? null,
        entry.createdAt,
        entry.updatedAt,
        entry.deletedAt ?? null,
      ],
    )
  },

  upsertCollectionEntries(entries) {
    if (entries.length === 0) return
    const db = openNativeDb()
    db.withTransactionSync(() => {
      for (const entry of entries) {
        this.upsertCollectionEntry(entry)
      }
    })
  },

  deleteCollectionEntry(id, deletedAt) {
    openNativeDb().runSync(
      "UPDATE collection_entries SET deleted_at = ?, updated_at = ? WHERE id = ?",
      [deletedAt, deletedAt, id],
    )
  },

  ownedQuantitiesByCardId(game, cardIds) {
    const counts = new Map<string, number>()
    const unique = [...new Set(cardIds)]
    if (unique.length === 0) return counts
    const db = openNativeDb()
    const chunkSize = 400
    for (let offset = 0; offset < unique.length; offset += chunkSize) {
      const slice = unique.slice(offset, offset + chunkSize)
      const placeholders = slice.map(() => "?").join(",")
      const rows = db.getAllSync<{ card_id: string; total: number }>(
        `SELECT card_id, SUM(quantity) AS total
         FROM collection_entries
         WHERE game = ?
           AND deleted_at IS NULL
           AND card_id IN (${placeholders})
           AND (binder_id IS NULL OR binder_id NOT IN (SELECT id FROM binders WHERE kind = 'scan_session'))
         GROUP BY card_id`,
        [game, ...slice],
      )
      for (const row of rows) counts.set(row.card_id, row.total)
    }
    return counts
  },

  transaction(run) {
    const db = openNativeDb()
    if (db.isInTransactionSync()) {
      run()
      return
    }
    db.withTransactionSync(run)
  },

  clearAll() {
    const db = openNativeDb()
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM kv_entries")
      db.runSync("DELETE FROM guest_decks")
      db.runSync("DELETE FROM guest_deck_meta")
      db.runSync("DELETE FROM card_details")
      db.runSync("DELETE FROM collection_entries")
      db.runSync("DELETE FROM binders")
    })
    detailsRevision += 1
  },
}

onStorageClear(() => {
  localCardDb.clearAll()
})
