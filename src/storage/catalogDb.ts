import { Paths } from "expo-file-system"
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite"

import type { CatalogDb, CatalogPrice, CatalogPrinting } from "./catalogDbTypes"
import type { LocalCard } from "../../convex/lib/localCards"

const CATALOG_DB_NAME = "scryve-catalog.db"
const SCHEMA_VERSION = 5
const ASYNC_IMPORT_BATCH_SIZE = 2000
const PRINTING_MULTI_INSERT_ROWS = 70
const PRICE_MULTI_INSERT_ROWS = 110
const LOCAL_CARD_MULTI_INSERT_ROWS = 200

let cachedDb: SQLiteDatabase | undefined

function cacheDirectory(): string | undefined {
  try {
    const uri = Paths.cache?.uri
    if (!uri) return undefined
    return uri.startsWith("file://") ? decodeURIComponent(uri.slice("file://".length)) : uri
  } catch {
    return undefined
  }
}

function openCatalogNativeDb(): SQLiteDatabase {
  if (cachedDb) return cachedDb
  const db = openDatabaseSync(CATALOG_DB_NAME, undefined, cacheDirectory())
  db.execSync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
  const versionRow = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
  if ((versionRow?.user_version ?? 0) < SCHEMA_VERSION) {
    db.withTransactionSync(() => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS catalog_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS printings (
          game TEXT NOT NULL,
          printing_id TEXT NOT NULL,
          card_id TEXT NOT NULL,
          name TEXT NOT NULL,
          name_normalized TEXT NOT NULL,
          set_code TEXT NOT NULL,
          set_name TEXT,
          collector_number TEXT NOT NULL,
          rarity TEXT,
          finishes TEXT NOT NULL,
          tcgplayer_id INTEGER,
          image_url TEXT,
          small_image_url TEXT,
          PRIMARY KEY (game, printing_id)
        );
        CREATE INDEX IF NOT EXISTS idx_printings_set_num
          ON printings (game, set_code, collector_number);
        -- why: lookups sort by set and number; without those columns here SQLite walks idx_printings_set_num over every printing instead.
        DROP INDEX IF EXISTS idx_printings_card;
        DROP INDEX IF EXISTS idx_printings_name;
        CREATE INDEX IF NOT EXISTS idx_printings_card_order
          ON printings (game, card_id, set_code, collector_number);
        CREATE INDEX IF NOT EXISTS idx_printings_name_order
          ON printings (game, name_normalized, set_code, collector_number);
        CREATE TABLE IF NOT EXISTS prices (
          game TEXT NOT NULL,
          printing_id TEXT NOT NULL,
          finish TEXT NOT NULL,
          source TEXT NOT NULL,
          currency TEXT NOT NULL,
          retail_cents INTEGER,
          buylist_cents INTEGER,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (game, printing_id, finish, source)
        );
        DROP INDEX IF EXISTS idx_prices_printing;
        CREATE TABLE IF NOT EXISTS local_cards (
          game TEXT NOT NULL,
          card_id TEXT NOT NULL,
          name_key TEXT NOT NULL,
          rank INTEGER,
          json TEXT NOT NULL,
          PRIMARY KEY (game, card_id)
        );
        CREATE INDEX IF NOT EXISTS idx_local_cards_name ON local_cards (game, name_key);
        DROP TABLE IF EXISTS printings_staging;
        DROP TABLE IF EXISTS prices_staging;
        DROP TABLE IF EXISTS local_cards_staging;
        CREATE TABLE local_cards_staging (
          game TEXT NOT NULL,
          card_id TEXT NOT NULL,
          name_key TEXT NOT NULL,
          rank INTEGER,
          json TEXT NOT NULL
        );
        CREATE TABLE printings_staging (
          game TEXT NOT NULL,
          printing_id TEXT NOT NULL,
          card_id TEXT NOT NULL,
          name TEXT NOT NULL,
          name_normalized TEXT NOT NULL,
          set_code TEXT NOT NULL,
          set_name TEXT,
          collector_number TEXT NOT NULL,
          rarity TEXT,
          finishes TEXT NOT NULL,
          tcgplayer_id INTEGER,
          image_url TEXT,
          small_image_url TEXT
        );
        CREATE TABLE prices_staging (
          game TEXT NOT NULL,
          printing_id TEXT NOT NULL,
          finish TEXT NOT NULL,
          source TEXT NOT NULL,
          currency TEXT NOT NULL,
          retail_cents INTEGER,
          buylist_cents INTEGER,
          updated_at TEXT NOT NULL
        );
      `)
      db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    })
  }
  cachedDb = db
  return db
}

interface RawPrintingRow {
  game: string
  printing_id: string
  card_id: string
  name: string
  name_normalized: string
  set_code: string
  set_name: string | null
  collector_number: string
  rarity: string | null
  finishes: string
  tcgplayer_id: number | null
  image_url: string | null
  small_image_url: string | null
}

interface RawPriceRow {
  game: string
  printing_id: string
  finish: string
  source: string
  currency: "USD" | "EUR"
  retail_cents: number | null
  buylist_cents: number | null
  updated_at: string
}

function hydratePrinting(row: RawPrintingRow): CatalogPrinting {
  let finishes: string[] = ["normal"]
  try {
    const parsed: unknown = JSON.parse(row.finishes)
    if (Array.isArray(parsed)) finishes = parsed.filter((v): v is string => typeof v === "string")
  } catch {}
  return {
    game: row.game,
    printingId: row.printing_id,
    cardId: row.card_id,
    name: row.name,
    nameNormalized: row.name_normalized,
    setCode: row.set_code,
    ...(row.set_name ? { setName: row.set_name } : {}),
    collectorNumber: row.collector_number,
    ...(row.rarity ? { rarity: row.rarity } : {}),
    finishes,
    ...(row.tcgplayer_id !== null ? { tcgplayerId: row.tcgplayer_id } : {}),
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.small_image_url ? { smallImageUrl: row.small_image_url } : {}),
  }
}

function hydratePrice(row: RawPriceRow): CatalogPrice {
  return {
    game: row.game,
    printingId: row.printing_id,
    finish: row.finish,
    source: row.source,
    currency: row.currency,
    ...(row.retail_cents !== null ? { retailCents: row.retail_cents } : {}),
    ...(row.buylist_cents !== null ? { buylistCents: row.buylist_cents } : {}),
    updatedAt: row.updated_at,
  }
}

export function resetCatalogDbConnection() {
  if (cachedDb) {
    try {
      cachedDb.closeSync()
    } catch {}
    cachedDb = undefined
  }
}

export const catalogDb: CatalogDb = {
  getMeta(key) {
    const row = openCatalogNativeDb().getFirstSync<{ value: string }>(
      "SELECT value FROM catalog_meta WHERE key = ?",
      [key],
    )
    return row?.value
  },

  setMeta(key, value) {
    openCatalogNativeDb().runSync(
      "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)",
      [key, value],
    )
  },

  replacePrintings(game, rows, version) {
    const db = openCatalogNativeDb()
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM printings WHERE game = ?", [game])
      for (const row of rows) {
        db.runSync(
          `INSERT OR REPLACE INTO printings (
            game, printing_id, card_id, name, name_normalized, set_code, set_name,
            collector_number, rarity, finishes, tcgplayer_id, image_url, small_image_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.game,
            row.printingId,
            row.cardId,
            row.name,
            row.nameNormalized,
            row.setCode.toLowerCase(),
            row.setName ?? null,
            row.collectorNumber.toLowerCase(),
            row.rarity ?? null,
            JSON.stringify(row.finishes),
            row.tcgplayerId ?? null,
            row.imageUrl ?? null,
            row.smallImageUrl ?? null,
          ],
        )
      }
      db.runSync("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)", [
        `printings:${game}:version`,
        version,
      ])
    })
  },

  replacePrices(game, rows) {
    const db = openCatalogNativeDb()
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM prices WHERE game = ?", [game])
      for (const row of rows) {
        db.runSync(
          `INSERT OR REPLACE INTO prices (
            game, printing_id, finish, source, currency, retail_cents, buylist_cents, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.game,
            row.printingId,
            row.finish,
            row.source,
            row.currency,
            row.retailCents ?? null,
            row.buylistCents ?? null,
            row.updatedAt,
          ],
        )
      }
    })
  },

  async replacePrintingsAsync(game, rows, version) {
    const db = openCatalogNativeDb()
    await db.runAsync("DELETE FROM printings_staging WHERE game = ?", [game])
    for (let offset = 0; offset < rows.length; offset += ASYNC_IMPORT_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + ASYNC_IMPORT_BATCH_SIZE)
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < chunk.length; i += PRINTING_MULTI_INSERT_ROWS) {
          const slice = chunk.slice(i, i + PRINTING_MULTI_INSERT_ROWS)
          const placeholders = slice.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")
          const params: (string | number | null)[] = []
          for (const row of slice) {
            params.push(
              row.game,
              row.printingId,
              row.cardId,
              row.name,
              row.nameNormalized,
              row.setCode.toLowerCase(),
              row.setName ?? null,
              row.collectorNumber.toLowerCase(),
              row.rarity ?? null,
              JSON.stringify(row.finishes),
              row.tcgplayerId ?? null,
              row.imageUrl ?? null,
              row.smallImageUrl ?? null,
            )
          }
          await db.runAsync(
            `INSERT INTO printings_staging (
              game, printing_id, card_id, name, name_normalized, set_code, set_name,
              collector_number, rarity, finishes, tcgplayer_id, image_url, small_image_url
            ) VALUES ${placeholders}`,
            params,
          )
        }
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM printings WHERE game = ?", [game])
      db.runSync(
        "INSERT OR REPLACE INTO printings SELECT * FROM printings_staging WHERE game = ?",
        [game],
      )
      db.runSync("DELETE FROM printings_staging WHERE game = ?", [game])
      db.runSync("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)", [
        `printings:${game}:version`,
        version,
      ])
    })
    try {
      db.execSync("PRAGMA wal_checkpoint(TRUNCATE);")
    } catch {}
  },

  async replacePricesAsync(game, rows) {
    const db = openCatalogNativeDb()
    await db.runAsync("DELETE FROM prices_staging WHERE game = ?", [game])
    for (let offset = 0; offset < rows.length; offset += ASYNC_IMPORT_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + ASYNC_IMPORT_BATCH_SIZE)
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < chunk.length; i += PRICE_MULTI_INSERT_ROWS) {
          const slice = chunk.slice(i, i + PRICE_MULTI_INSERT_ROWS)
          const placeholders = slice.map(() => "(?,?,?,?,?,?,?,?)").join(",")
          const params: (string | number | null)[] = []
          for (const row of slice) {
            params.push(
              row.game,
              row.printingId,
              row.finish,
              row.source,
              row.currency,
              row.retailCents ?? null,
              row.buylistCents ?? null,
              row.updatedAt,
            )
          }
          await db.runAsync(
            `INSERT INTO prices_staging (
              game, printing_id, finish, source, currency, retail_cents, buylist_cents, updated_at
            ) VALUES ${placeholders}`,
            params,
          )
        }
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM prices WHERE game = ?", [game])
      db.runSync("INSERT OR REPLACE INTO prices SELECT * FROM prices_staging WHERE game = ?", [
        game,
      ])
      db.runSync("DELETE FROM prices_staging WHERE game = ?", [game])
    })
    try {
      db.execSync("PRAGMA wal_checkpoint(TRUNCATE);")
    } catch {}
  },

  getPrinting(game, printingId) {
    const row = openCatalogNativeDb().getFirstSync<RawPrintingRow>(
      "SELECT * FROM printings WHERE game = ? AND printing_id = ?",
      [game, printingId],
    )
    return row ? hydratePrinting(row) : undefined
  },

  findPrintingBySetNumber(game, setCode, collectorNumber) {
    const normalizedSet = setCode.trim().toLowerCase()
    const rawNumber = collectorNumber.trim().toLowerCase()
    const normalizedNumber = rawNumber.replace(/^0+/, "") || "0"
    const db = openCatalogNativeDb()
    const exact = db.getFirstSync<RawPrintingRow>(
      "SELECT * FROM printings WHERE game = ? AND set_code = ? AND collector_number = ?",
      [game, normalizedSet, rawNumber],
    )
    if (exact) return hydratePrinting(exact)
    const fallback = db.getFirstSync<RawPrintingRow>(
      "SELECT * FROM printings WHERE game = ? AND set_code = ? AND COALESCE(NULLIF(LTRIM(collector_number, '0'), ''), '0') = ?",
      [game, normalizedSet, normalizedNumber],
    )
    return fallback ? hydratePrinting(fallback) : undefined
  },

  findPrintingsByName(game, nameNormalized) {
    return openCatalogNativeDb()
      .getAllSync<RawPrintingRow>(
        "SELECT * FROM printings WHERE game = ? AND name_normalized = ? ORDER BY set_code ASC, collector_number ASC",
        [game, nameNormalized],
      )
      .map(hydratePrinting)
  },

  findPrintingsByCardId(game, cardId) {
    return openCatalogNativeDb()
      .getAllSync<RawPrintingRow>(
        "SELECT * FROM printings WHERE game = ? AND card_id = ? ORDER BY set_code ASC, collector_number ASC",
        [game, cardId],
      )
      .map(hydratePrinting)
  },

  getPricesForPrinting(game, printingId) {
    return openCatalogNativeDb()
      .getAllSync<RawPriceRow>("SELECT * FROM prices WHERE game = ? AND printing_id = ?", [
        game,
        printingId,
      ])
      .map(hydratePrice)
  },

  getPricesBatch(game, printingIds) {
    const result = new Map<string, CatalogPrice[]>()
    const unique = [...new Set(printingIds)]
    if (unique.length === 0) return result
    const db = openCatalogNativeDb()
    const chunkSize = 400
    for (let offset = 0; offset < unique.length; offset += chunkSize) {
      const slice = unique.slice(offset, offset + chunkSize)
      const placeholders = slice.map(() => "?").join(",")
      const rows = db.getAllSync<RawPriceRow>(
        `SELECT * FROM prices WHERE game = ? AND printing_id IN (${placeholders})`,
        [game, ...slice],
      )
      for (const row of rows) {
        const list = result.get(row.printing_id) ?? []
        list.push(hydratePrice(row))
        result.set(row.printing_id, list)
      }
    }
    return result
  },

  hasPrintings(game) {
    return Boolean(
      openCatalogNativeDb().getFirstSync("SELECT 1 FROM printings WHERE game = ? LIMIT 1", [game]),
    )
  },

  hasPrices(game) {
    return Boolean(
      openCatalogNativeDb().getFirstSync("SELECT 1 FROM prices WHERE game = ? LIMIT 1", [game]),
    )
  },

  async replaceLocalCardsAsync(game, rows, version) {
    const db = openCatalogNativeDb()
    await db.runAsync("DELETE FROM local_cards_staging WHERE game = ?", [game])
    for (let offset = 0; offset < rows.length; offset += ASYNC_IMPORT_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + ASYNC_IMPORT_BATCH_SIZE)
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < chunk.length; i += LOCAL_CARD_MULTI_INSERT_ROWS) {
          const slice = chunk.slice(i, i + LOCAL_CARD_MULTI_INSERT_ROWS)
          await db.runAsync(
            `INSERT INTO local_cards_staging (game, card_id, name_key, rank, json) VALUES ${slice
              .map(() => "(?,?,?,?,?)")
              .join(",")}`,
            slice.flatMap((row) => [game, row.cardId, row.nameKey, row.rank ?? null, row.json]),
          )
        }
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM local_cards WHERE game = ?", [game])
      db.runSync(
        "INSERT OR REPLACE INTO local_cards SELECT * FROM local_cards_staging WHERE game = ?",
        [game],
      )
      db.runSync("DELETE FROM local_cards_staging WHERE game = ?", [game])
      db.runSync("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)", [
        `localCards:${game}:version`,
        version,
      ])
    })
    try {
      db.execSync("PRAGMA wal_checkpoint(TRUNCATE);")
    } catch {}
  },

  searchLocalCards(game, nameKey, limit) {
    // why: name keys are ASCII, so U+FFFF sorts after every name that starts with the key.
    const end = `${nameKey}\uffff`
    return openCatalogNativeDb()
      .getAllSync<{ json: string }>(
        `SELECT json FROM local_cards
          WHERE game = ? AND ((name_key >= ? AND name_key < ?) OR instr(' ' || name_key, ?) > 0)
          ORDER BY name_key = ? DESC, (name_key >= ? AND name_key < ?) DESC, rank IS NULL, rank, name_key
          LIMIT ?`,
        [game, nameKey, end, ` ${nameKey}`, nameKey, nameKey, end, limit],
      )
      .map((row): LocalCard => JSON.parse(row.json))
  },

  clearAll() {
    const db = openCatalogNativeDb()
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM catalog_meta")
      db.runSync("DELETE FROM printings")
      db.runSync("DELETE FROM prices")
      db.runSync("DELETE FROM local_cards")
    })
  },
}
