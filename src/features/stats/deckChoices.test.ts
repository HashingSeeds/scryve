import { chosenDeckCards, chosenDeckKey, localDeckChoices, pinDeckChoice } from "./deckChoices"
import { deckFingerprint } from "./deckFingerprint"

const mockLoadPending = jest.fn()
const mockMappedVersionId = jest.fn((_versionId: string): string | undefined => undefined)
const mockLoadCards = jest.fn()
const mockLoadShelf = jest.fn(() => [
  { _id: "server", syncId: "stable", deckKey: "synced-key", latestVersionId: "version" },
])
const mockLoadGuestDeck = jest.fn()

jest.mock("@/features/decks/decksVersionWrites", () => ({
  ...jest.requireActual("@/features/decks/decksVersionWrites"),
  DeckVersionWriteRepository: jest
    .fn()
    .mockImplementation(() => ({ loadPending: mockLoadPending })),
}))
jest.mock("@/features/decks/deckVersionsCache", () => ({
  DeckVersionCacheRepository: jest
    .fn()
    .mockImplementation(() => ({ loadCards: mockLoadCards, mappedVersionId: mockMappedVersionId })),
}))
jest.mock("@/features/decks/decksSync", () => ({
  DeckSyncRepository: jest.fn().mockImplementation(() => ({ loadShelf: mockLoadShelf })),
}))
jest.mock("@/features/decks/guestDeck", () => ({
  loadGuestDeck: (...args: unknown[]) => mockLoadGuestDeck(...args),
}))
jest.mock("./deckFingerprint", () => ({
  deckFingerprint: jest.fn(async () => `v1:${"a".repeat(64)}`),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockLoadCards.mockReturnValue(undefined)
  mockLoadPending.mockReturnValue([])
  mockMappedVersionId.mockReset()
})

it("uses a local deck's explicit key and defaults older decks to localId without hashing", () => {
  const local = {
    schemaVersion: 1 as const,
    localId: "local",
    createdAt: 1,
    updatedAt: 1,
    deck: { name: "Burn", format: "modern", cards: [] },
  }
  const keyed = { ...local, deckKey: "portable-key" }
  expect(localDeckChoices([local, keyed])).toMatchObject([
    { deckKey: "local", localId: "local", system: "mtg" },
    { deckKey: "portable-key", localId: "local" },
  ])
  expect(deckFingerprint).not.toHaveBeenCalled()
})

it("hashes only the selected synced version's cached cards and resolves its shelf key", async () => {
  const cards = [{ name: "Bolt", quantity: 4, oracleId: "bolt" }]
  mockLoadCards.mockReturnValue({ cards })
  expect(await pinDeckChoice({ versionId: "version", name: "Burn" }, "owner")).toEqual({
    deckVersionId: "version",
    deckKey: "synced-key",
    deckName: "Burn",
    deckFingerprint: `v1:${"a".repeat(64)}`,
  })
  expect(mockLoadCards).toHaveBeenCalledWith("version")
  expect(deckFingerprint).toHaveBeenCalledTimes(1)
  expect(deckFingerprint).toHaveBeenCalledWith(cards)
})

it("leaves an uncached synced list's fingerprint unknown", async () => {
  expect(
    await pinDeckChoice({ versionId: "version", name: "Burn", deckKey: "key" }, "owner"),
  ).toMatchObject({
    deckKey: "key",
    deckFingerprint: undefined,
  })
  expect(deckFingerprint).not.toHaveBeenCalled()
})

it("loads only the selected local deck and never sends its local id as a server version", async () => {
  const cards = [{ name: "Bolt", quantity: 4 }]
  mockLoadGuestDeck.mockReturnValue({ deck: { cards } })
  expect(await pinDeckChoice({ localId: "local", deckKey: "key", name: "Burn" }, "owner")).toEqual({
    deckVersionId: undefined,
    deckKey: "key",
    deckName: "Burn",
    deckFingerprint: `v1:${"a".repeat(64)}`,
  })
  expect(mockLoadGuestDeck).toHaveBeenCalledWith("local")
  expect(mockLoadCards).not.toHaveBeenCalled()
})

it("keeps a game's pin when its list is no longer cached", async () => {
  const pin = { name: "Burn", deckKey: "key", deckFingerprint: `v1:${"b".repeat(64)}` }
  expect(await pinDeckChoice(pin, "owner")).toMatchObject({
    deckName: pin.name,
    deckKey: pin.deckKey,
    deckFingerprint: pin.deckFingerprint,
  })
})

it("does not rehash a pinned list after its cached cards change", async () => {
  mockLoadCards.mockReturnValue({ cards: [{ name: "Edited", quantity: 1 }] })
  const pinned = {
    name: "Burn",
    versionId: "version",
    deckKey: "key",
    deckFingerprint: `v1:${"b".repeat(64)}`,
  }
  expect(await pinDeckChoice(pinned, "owner")).toMatchObject({
    deckFingerprint: pinned.deckFingerprint,
  })
  expect(mockLoadCards).not.toHaveBeenCalled()
  expect(deckFingerprint).not.toHaveBeenCalled()
})

it("asks for a new selection if a chosen local deck disappears before Start", async () => {
  mockLoadGuestDeck.mockReturnValue(undefined)
  await expect(
    pinDeckChoice({ name: "Burn", localId: "gone", deckKey: "key" }, "owner"),
  ).rejects.toThrow()
  expect(deckFingerprint).not.toHaveBeenCalled()
})

it("does not fetch cards to recover a missing synced key", () => {
  expect(chosenDeckKey({ name: "Burn", versionId: "missing" }, "owner")).toBeUndefined()
  expect(chosenDeckCards({ name: "Burn", versionId: "missing" }, "owner")).toBeUndefined()
})

it("pins the newest pending card write for the chosen version instead of its cache", () => {
  mockLoadCards.mockReturnValue({ cards: [{ name: "Cached", quantity: 1 }] })
  const pending = (
    name: string,
    expectedRevision: number,
    versionId = "version",
    op = "cards",
  ) => ({
    versionId,
    expectedRevision,
    op,
    cards: [{ name, quantity: 1 }],
  })
  mockLoadPending.mockReturnValue([
    pending("New", 2),
    pending("Old", 1),
    pending("Other version", 3, "other"),
    pending("Rename", 4, "version", "rename"),
  ])
  expect(chosenDeckCards({ name: "Burn", versionId: "version" }, "owner")).toEqual([
    { name: "New", quantity: 1 },
  ])
})

it("uses a queued edit under its acknowledged version id, including an empty list", () => {
  mockLoadCards.mockReturnValue({ cards: [{ name: "Cached", quantity: 1 }] })
  mockMappedVersionId.mockImplementation((id) => (id === "provisional" ? "version" : undefined))
  mockLoadPending.mockReturnValue([{ versionId: "provisional", expectedRevision: 1, cards: [] }])
  expect(chosenDeckCards({ name: "Burn", versionId: "version" }, "owner")).toEqual([])
})
