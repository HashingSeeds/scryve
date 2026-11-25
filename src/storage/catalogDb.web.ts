import type { CatalogDb, CatalogPrice, CatalogPrinting } from "./catalogDbTypes"

// why: web keeps catalog printings and daily prices in memory (repopulated via HTTP ETag cache) instead of localStorage or COOP/COEP-gated SQLite WASM.
const metaMap = new Map<string, string>()
const printingsByKey = new Map<string, CatalogPrinting>()
const printingsBySetNum = new Map<string, CatalogPrinting>()
const printingsBySetNormNum = new Map<string, CatalogPrinting>()
const printingsByName = new Map<string, CatalogPrinting[]>()
const printingsByCardId = new Map<string, CatalogPrinting[]>()
const pricesByPrinting = new Map<string, CatalogPrice[]>()

function normalizeCollectorNumber(value: string) {
  return value.trim().toLowerCase().replace(/^0+/, "") || "0"
}

function printingKey(game: string, printingId: string) {
  return `${game}\u0000${printingId}`
}

function setNumKey(game: string, setCode: string, collectorNumber: string) {
  return `${game}\u0000${setCode.toLowerCase()}\u0000${collectorNumber.toLowerCase()}`
}

function groupKey(game: string, value: string) {
  return `${game}\u0000${value}`
}

export const catalogDb: CatalogDb = {
  getMeta(key) {
    return metaMap.get(key)
  },

  setMeta(key, value) {
    metaMap.set(key, value)
  },

  replacePrintings(game, rows, version) {
    for (const [key, entry] of printingsByKey) {
      if (entry.game === game) printingsByKey.delete(key)
    }
    for (const [key, entry] of printingsBySetNum) {
      if (entry.game === game) printingsBySetNum.delete(key)
    }
    for (const [key, entry] of printingsBySetNormNum) {
      if (entry.game === game) printingsBySetNormNum.delete(key)
    }
    for (const key of printingsByName.keys()) {
      if (key.startsWith(`${game}\u0000`)) printingsByName.delete(key)
    }
    for (const key of printingsByCardId.keys()) {
      if (key.startsWith(`${game}\u0000`)) printingsByCardId.delete(key)
    }
    for (const row of rows) {
      const normalized: CatalogPrinting = {
        ...row,
        setCode: row.setCode.toLowerCase(),
        collectorNumber: row.collectorNumber.toLowerCase(),
      }
      printingsByKey.set(printingKey(game, normalized.printingId), normalized)
      printingsBySetNum.set(
        setNumKey(game, normalized.setCode, normalized.collectorNumber),
        normalized,
      )
      const normKey = setNumKey(
        game,
        normalized.setCode,
        normalizeCollectorNumber(normalized.collectorNumber),
      )
      if (!printingsBySetNormNum.has(normKey)) {
        printingsBySetNormNum.set(normKey, normalized)
      }
      const byName = printingsByName.get(groupKey(game, normalized.nameNormalized)) ?? []
      byName.push(normalized)
      printingsByName.set(groupKey(game, normalized.nameNormalized), byName)
      const byCard = printingsByCardId.get(groupKey(game, normalized.cardId)) ?? []
      byCard.push(normalized)
      printingsByCardId.set(groupKey(game, normalized.cardId), byCard)
    }
    metaMap.set(`printings:${game}:version`, version)
  },

  replacePrices(game, rows) {
    for (const key of pricesByPrinting.keys()) {
      if (key.startsWith(`${game}\u0000`)) pricesByPrinting.delete(key)
    }
    for (const row of rows) {
      const key = printingKey(game, row.printingId)
      const list = pricesByPrinting.get(key) ?? []
      list.push(row)
      pricesByPrinting.set(key, list)
    }
  },

  async replacePrintingsAsync(game, rows, version) {
    this.replacePrintings(game, rows, version)
  },

  async replacePricesAsync(game, rows) {
    this.replacePrices(game, rows)
  },

  getPrinting(game, printingId) {
    return printingsByKey.get(printingKey(game, printingId))
  },

  findPrintingBySetNumber(game, setCode, collectorNumber) {
    const direct = printingsBySetNum.get(setNumKey(game, setCode.trim(), collectorNumber.trim()))
    if (direct) return direct
    return printingsBySetNormNum.get(
      setNumKey(game, setCode.trim(), normalizeCollectorNumber(collectorNumber)),
    )
  },

  findPrintingsByName(game, nameNormalized) {
    return printingsByName.get(groupKey(game, nameNormalized)) ?? []
  },

  findPrintingsByCardId(game, cardId) {
    return printingsByCardId.get(groupKey(game, cardId)) ?? []
  },

  getPricesForPrinting(game, printingId) {
    return pricesByPrinting.get(printingKey(game, printingId)) ?? []
  },

  getPricesBatch(game, printingIds) {
    const result = new Map<string, CatalogPrice[]>()
    for (const id of printingIds) {
      const list = pricesByPrinting.get(printingKey(game, id))
      if (list) result.set(id, list)
    }
    return result
  },

  hasPrintings(game) {
    for (const entry of printingsByKey.values()) {
      if (entry.game === game) return true
    }
    return false
  },

  hasPrices(game) {
    for (const key of pricesByPrinting.keys()) {
      if (key.startsWith(`${game}\u0000`)) return true
    }
    return false
  },

  clearAll() {
    metaMap.clear()
    printingsByKey.clear()
    printingsBySetNum.clear()
    printingsBySetNormNum.clear()
    printingsByName.clear()
    printingsByCardId.clear()
    pricesByPrinting.clear()
  },
}
