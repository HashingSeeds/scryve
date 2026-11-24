import { Paths } from "expo-file-system"
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite"

import type { CatalogDb, CatalogPrice, CatalogPrinting } from "./catalogDbTypes"

const CATALOG_DB_NAME = "scryve-catalog.db"
const SCHEMA_VERSION = 2
const ASYNC_IMPORT_BATCH_SIZE = 1000

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
        CREATE INDEX IF NOT EXISTS idx_printings_card
          ON printings (game, card_id);
        CREATE INDEX IF NOT EXISTS idx_printings_name
          ON printings (game, name_normalized);
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
        CREATE INDEX IF NOT EXISTS idx_prices_printing
          ON prices (game, printing_id);
        CREATE TABLE IF NOT EXISTS printings_staging (
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
        CREATE TABLE IF NOT EXISTS prices_staging (
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

  replacePrices(game, rows, updatedAt) {
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
      db.runSync("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)", [
        `prices:${game}:updatedAt`,
        updatedAt,
      ])
    })
  },

  async replacePrintingsAsync(game, rows, version) {
    const db = openCatalogNativeDb()
    await db.runAsync("DELETE FROM printings_staging WHERE game = ?", [game])
    const stmt = await db.prepareAsync(
      `INSERT OR REPLACE INTO printings_staging (
        game, printing_id, card_id, name, name_normalized, set_code, set_name,
        collector_number, rarity, finishes, tcgplayer_id, image_url, small_image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    try {
      for (let offset = 0; offset < rows.length; offset += ASYNC_IMPORT_BATCH_SIZE) {
        const chunk = rows.slice(offset, offset + ASYNC_IMPORT_BATCH_SIZE)
        await db.withTransactionAsync(async () => {
          for (const row of chunk) {
            await stmt.executeAsync([
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
            ])
          }
        })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      await stmt.finalizeAsync()
    }
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM printings WHERE game = ?", [game])
      await db.runAsync(`INSERT INTO printings SELECT * FROM printings_staging WHERE game = ?`, [
        game,
      ])
      await db.runAsync("DELETE FROM printings_staging WHERE game = ?", [game])
      await db.runAsync("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)", [
        `printings:${game}:version`,
        version,
      ])
    })
  },

  async replacePricesAsync(game, rows, updatedAt) {
    const db = openCatalogNativeDb()
    await db.runAsync("DELETE FROM prices_staging WHERE game = ?", [game])
    const stmt = await db.prepareAsync(
      `INSERT OR REPLACE INTO prices_staging (
        game, printing_id, finish, source, currency, retail_cents, buylist_cents, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    try {
      for (let offset = 0; offset < rows.length; offset += ASYNC_IMPORT_BATCH_SIZE) {
        const chunk = rows.slice(offset, offset + ASYNC_IMPORT_BATCH_SIZE)
        await db.withTransactionAsync(async () => {
          for (const row of chunk) {
            await stmt.executeAsync([
              row.game,
              row.printingId,
              row.finish,
              row.source,
              row.currency,
              row.retailCents ?? null,
              row.buylistCents ?? null,
              row.updatedAt,
            ])
          }
        })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      await stmt.finalizeAsync()
    }
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM prices WHERE game = ?", [game])
      await db.runAsync(`INSERT INTO prices SELECT * FROM prices_staging WHERE game = ?`, [game])
      await db.runAsync("DELETE FROM prices_staging WHERE game = ?", [game])
      await db.runAsync("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)", [
        `prices:${game}:updatedAt`,
        updatedAt,
      ])
    })
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
    const normalizedNumber = collectorNumber.trim().replace(/^0+/, "").toLowerCase()
    const db = openCatalogNativeDb()
    const exact = db.getFirstSync<RawPrintingRow>(
      "SELECT * FROM printings WHERE game = ? AND set_code = ? AND collector_number = ?",
      [game, normalizedSet, collectorNumber.trim().toLowerCase()],
    )
    if (exact) return hydratePrinting(exact)
    if (normalizedNumber !== collectorNumber.trim().toLowerCase()) {
      const trimmed = db.getFirstSync<RawPrintingRow>(
        "SELECT * FROM printings WHERE game = ? AND set_code = ? AND collector_number = ?",
        [game, normalizedSet, normalizedNumber],
      )
      if (trimmed) return hydratePrinting(trimmed)
    }
    return undefined
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

  countPrintings(game) {
    const row = openCatalogNativeDb().getFirstSync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM printings WHERE game = ?",
      [game],
    )
    return row?.count ?? 0
  },

  countPrices(game) {
    const row = openCatalogNativeDb().getFirstSync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM prices WHERE game = ?",
      [game],
    )
    return row?.count ?? 0
  },

  clearAll() {
    const db = openCatalogNativeDb()
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM catalog_meta")
      db.runSync("DELETE FROM printings")
      db.runSync("DELETE FROM prices")
    })
  },
}
