import { clear, save } from "@/utils/storage"

import { lookupListSnapshot, saveListSnapshot } from "./listSnapshots"

const mockLocals = jest.fn(
  () =>
    [] as {
      localId: string
      deckKey?: string
      deck: { cards: { name: string; quantity: number }[] }
    }[],
)
const mockCards = jest.fn()
const mockVersions = jest.fn(() => [{ versionId: "version" }])
const mockMetadata = jest.fn(() => [{ deckId: "deck", deckKey: "key" }])
jest.mock("@/features/decks/guestDeck", () => ({ loadGuestDecks: () => mockLocals() }))
jest.mock("@/features/decks/decksSync", () => ({
  DeckSyncRepository: jest
    .fn()
    .mockImplementation(() => ({ loadMetadata: mockMetadata, loadShelf: () => [] })),
}))
jest.mock("@/features/decks/deckVersionsCache", () => ({
  DeckVersionCacheRepository: jest
    .fn()
    .mockImplementation(() => ({ loadVersions: mockVersions, loadCards: mockCards })),
}))
jest.mock("./deckFingerprint", () => ({
  deckFingerprint: async (cards: { name: string }[]) => cards[0]?.name,
}))
beforeEach(() => {
  clear()
  mockLocals.mockReturnValue([])
  mockCards.mockReturnValue(undefined)
})

it("retains the newest twenty distinct lists per deck and updates existing pins", async () => {
  for (let i = 0; i < 21; i++)
    saveListSnapshot("key", String(i), [{ name: "Bolt", quantity: i + 1 }])
  expect(await lookupListSnapshot("key", "0", "owner")).toBeUndefined()
  expect(await lookupListSnapshot("key", "1", "owner")).toEqual([{ name: "Bolt", quantity: 2 }])
  saveListSnapshot("key", "1", [{ name: "Bolt", quantity: 4 }])
  expect(await lookupListSnapshot("key", "1", "owner")).toEqual([{ name: "Bolt", quantity: 4 }])
  expect(await lookupListSnapshot("other", "1", "owner")).toBeUndefined()
})

it("falls back to local cards only when their fingerprint matches", async () => {
  mockLocals.mockReturnValue([
    { localId: "key", deck: { cards: [{ name: "current", quantity: 1 }] } },
  ])
  expect(await lookupListSnapshot("key", "current", "owner")).toEqual([
    { name: "current", quantity: 1 },
  ])
  expect(await lookupListSnapshot("key", "old", "owner")).toBeUndefined()
})

it("finds matching cached synced cards and rejects edited contents", async () => {
  mockCards.mockReturnValue({ cards: [{ name: "cached", quantity: 2 }] })
  expect(await lookupListSnapshot("key", "cached", "owner")).toEqual([
    { name: "cached", quantity: 2 },
  ])
  expect(await lookupListSnapshot("key", "old", "owner")).toBeUndefined()
})

it("ignores malformed persisted snapshots", async () => {
  save("scryve.stats.lists.v1.key", [
    { fingerprint: "bad", cards: [{ name: "Bolt", quantity: -1 }] },
  ])
  expect(await lookupListSnapshot("key", "bad", "owner")).toBeUndefined()
})
