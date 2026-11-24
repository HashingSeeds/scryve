import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite"

import { onStorageClear } from "@/utils/storage"

import type {
  CardDetailUpsert,
  LocalCardDb,
  StoredCardDetailRow,
  StoredGuestDeckRow,
} from "./localDbTypes"

const DATABASE_NAME = "scryve-cards.db"
const SCHEMA_VERSION = 1

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
      `)
      db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    })
  }
  cachedDb = db
  return db
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
    })
    detailsRevision += 1
  },
}

onStorageClear(() => {
  localCardDb.clearAll()
})
