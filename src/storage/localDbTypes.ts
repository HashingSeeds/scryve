export interface StoredGuestDeckRow {
  localId: string
  payload: string
}

export interface StoredCardDetailRow {
  key: string
  payload: string
}

export interface CardDetailUpsert {
  key: string
  payload: string
  accessedAt: number
}

export type BinderKind = "binder" | "scan_session" | "trade_list" | "want_list"

export interface StoredBinder {
  id: string
  kind: BinderKind
  name: string
  game?: string
  defaultSetCode?: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export interface StoredCollectionEntry {
  id: string
  game: string
  cardId: string
  printingId: string
  name: string
  setCode: string
  collectorNumber: string
  finish: string
  condition: string
  language: string
  edition?: string
  quantity: number
  binderId?: string
  acquiredCents?: number
  notes?: string
  imageUrl?: string
  smallImageUrl?: string
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface LocalCardDb {
  readonly sharesLegacyStorage: boolean
  getKv(key: string): string | undefined
  setKv(key: string, value: string): void
  deleteKv(key: string): void
  getAllKvKeys(): string[]
  listGuestDecks(): StoredGuestDeckRow[]
  upsertGuestDeck(
    localId: string,
    deckKey: string | undefined,
    updatedAt: number,
    payload: string,
  ): void
  deleteGuestDeck(localId: string): void
  clearGuestDecks(): void
  getGuestMeta(key: string): string | undefined
  setGuestMeta(key: string, value: string): void
  deleteGuestMeta(key: string): void
  listCardDetails(): StoredCardDetailRow[]
  getCardDetail(key: string): string | undefined
  upsertCardDetails(entries: readonly CardDetailUpsert[], maxEntries: number): void
  clearCardDetails(): void
  cardDetailsRevision(): number
  listBinders(kind?: BinderKind): StoredBinder[]
  upsertBinder(binder: StoredBinder): void
  deleteBinder(id: string): void
  listCollectionEntries(filter?: {
    game?: string
    binderId?: string | null
    cardId?: string
    includeDeleted?: boolean
  }): StoredCollectionEntry[]
  getCollectionEntry(id: string): StoredCollectionEntry | undefined
  upsertCollectionEntry(entry: StoredCollectionEntry): void
  upsertCollectionEntries(entries: readonly StoredCollectionEntry[]): void
  deleteCollectionEntry(id: string, deletedAt: number): void
  ownedQuantitiesByCardId(game: string, cardIds: readonly string[]): Map<string, number>
  transaction(run: () => void): void
  clearAll(): void
}
