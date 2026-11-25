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
  transaction(run: () => void): void
  clearAll(): void
}
