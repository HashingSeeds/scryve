export interface CatalogPrinting {
  game: string
  printingId: string
  cardId: string
  name: string
  nameNormalized: string
  setCode: string
  setName?: string
  collectorNumber: string
  rarity?: string
  finishes: string[]
  tcgplayerId?: number
  imageUrl?: string
  smallImageUrl?: string
}

export interface CatalogPrice {
  game: string
  printingId: string
  finish: string
  source: string
  currency: "USD" | "EUR"
  retailCents?: number
  buylistCents?: number
  updatedAt: string
}

export interface CatalogDb {
  getMeta(key: string): string | undefined
  setMeta(key: string, value: string): void
  replacePrintings(game: string, rows: readonly CatalogPrinting[], version: string): void
  replacePrices(game: string, rows: readonly CatalogPrice[]): void
  replacePrintingsAsync(
    game: string,
    rows: readonly CatalogPrinting[],
    version: string,
  ): Promise<void>
  replacePricesAsync(game: string, rows: readonly CatalogPrice[]): Promise<void>
  getPrinting(game: string, printingId: string): CatalogPrinting | undefined
  findPrintingBySetNumber(
    game: string,
    setCode: string,
    collectorNumber: string,
  ): CatalogPrinting | undefined
  findPrintingsByName(game: string, nameNormalized: string): CatalogPrinting[]
  findPrintingsByCardId(game: string, cardId: string): CatalogPrinting[]
  getPricesForPrinting(game: string, printingId: string): CatalogPrice[]
  getPricesBatch(game: string, printingIds: readonly string[]): Map<string, CatalogPrice[]>
  hasPrintings(game: string): boolean
  hasPrices(game: string): boolean
  clearAll(): void
}
