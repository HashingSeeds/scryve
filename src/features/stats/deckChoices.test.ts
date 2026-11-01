import { keepSharedDeck, loadSharedDecks } from "@/features/decks/sharedDecks"
import { clear } from "@/utils/storage"

import {
  chosenDeckCards,
  chosenDeckKey,
  localDeckChoices,
  pinDeckChoice,
  sharedDeckChoices,
} from "./deckChoices"
import { deckFingerprint } from "./deckFingerprint"
import { lookupListSnapshot } from "./listSnapshots"

const mockLoadPending = jest.fn()
const mockMappedVersionId = jest.fn((_versionId: string): string | undefined => undefined)
const mockLoadCards = jest.fn()
const mockLoadShelf = jest.fn(() => [
  {
    _id: "server",
    syncId: "stable",
    deckKey: "synced-key",
    latestVersionId: "version",
    game: "mtg",
  },
])
const mockLoadGuestDeck = jest.fn()

jest.mock("@/features/decks/decksVersionWrites", () => ({
  ...jest.requireActual("@/features/decks/decksVersionWrites"),
  versionWriteOutbox: jest.fn(() => ({ getState: () => ({ pending: mockLoadPending() }) })),
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
  guestDeckPlayCards: jest.requireActual("@/features/decks/guestDeck").guestDeckPlayCards,
  isGuestDeckPayload: jest.requireActual("@/features/decks/guestDeck").isGuestDeckPayload,
}))
jest.mock("./deckFingerprint", () => ({
  deckFingerprint: jest.fn(async () => `v1:${"a".repeat(64)}`),
}))

beforeEach(() => {
  clear()
  jest.clearAllMocks()
  mockLoadCards.mockReturnValue(undefined)
  mockLoadPending.mockReturnValue([])
  mockMappedVersionId.mockReset()
  mockLoadShelf.mockReturnValue([
    {
      _id: "server",
      syncId: "stable",
      deckKey: "synced-key",
      latestVersionId: "version",
      game: "mtg",
    },
  ])
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

it("pins a shared deck from the copy kept on this device, under its own key", async () => {
  const token = "s".repeat(43)
  const deckKey = `shared-${"b".repeat(32)}`
  keepSharedDeck(
    {
      deckKey,
      name: "Borrowed",
      game: "mtg",
      format: "commander",
      cards: [{ name: "Sol Ring", quantity: 1 }],
    },
    token,
  )
  const [choice] = sharedDeckChoices(loadSharedDecks())
  const fingerprint = `v1:${"a".repeat(64)}`
  expect(await pinDeckChoice(choice, "owner")).toEqual({
    deckKey,
    deckVersionId: undefined,
    deckName: "Borrowed",
    deckFingerprint: fingerprint,
  })
  expect(await lookupListSnapshot(deckKey, fingerprint, "owner")).toEqual([
    { name: "Sol Ring", quantity: 1, game: "mtg" },
  ])
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
  const pinned = cards.map((card) => ({ ...card, game: "mtg" }))
  expect(deckFingerprint).toHaveBeenCalledWith(pinned)
  expect(await lookupListSnapshot("synced-key", `v1:${"a".repeat(64)}`, "owner")).toEqual(pinned)
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
  expect(await lookupListSnapshot("key", `v1:${"a".repeat(64)}`, "owner")).toEqual(
    cards.map((card) => ({ ...card, game: "mtg" })),
  )
  expect(mockLoadCards).not.toHaveBeenCalled()
})

it("starts a device deck with the version it brings", () => {
  const older = [{ name: "Shock", quantity: 4 }]
  mockLoadGuestDeck.mockReturnValue({
    createdAt: 1,
    updatedAt: 1,
    bringing: 1,
    deck: { game: "mtg", cards: [{ name: "Bolt", quantity: 4 }] },
    versions: [
      { number: 1, name: "Current", createdAt: 1, updatedAt: 1, cards: older },
      { number: 2, name: "Tuned", createdAt: 1, updatedAt: 1 },
    ],
  })
  expect(chosenDeckCards({ localId: "local", name: "Burn" }, "owner")).toEqual([
    { ...older[0], game: "mtg" },
  ])
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
    { name: "New", quantity: 1, game: "mtg" },
  ])
})

it("uses a queued edit under its acknowledged version id, including an empty list", () => {
  mockLoadCards.mockReturnValue({ cards: [{ name: "Cached", quantity: 1 }] })
  mockMappedVersionId.mockImplementation((id) => (id === "provisional" ? "version" : undefined))
  mockLoadPending.mockReturnValue([{ versionId: "provisional", expectedRevision: 1, cards: [] }])
  expect(chosenDeckCards({ name: "Burn", versionId: "version" }, "owner")).toEqual([])
})

it.each([false, true])(
  "fills missing card games from the synced deck with a pending edit: %s",
  (pending) => {
    const cards = [
      { name: "Pikachu", cardId: "base1-58", quantity: 4 },
      { name: "Raichu", cardId: "base1-14", quantity: 2, game: "pokemon" },
    ]
    mockLoadShelf.mockReturnValue([
      {
        _id: "server",
        syncId: "stable",
        deckKey: "synced-key",
        latestVersionId: "version",
        game: "pokemon",
      },
    ])
    mockLoadCards.mockReturnValue({ cards })
    if (pending)
      mockLoadPending.mockReturnValue([{ versionId: "version", expectedRevision: 1, cards }])
    expect(chosenDeckCards({ name: "Pikachu", versionId: "version" }, "owner")).toEqual(
      cards.map((card) => ({ ...card, game: "pokemon" })),
    )
  },
)

it("uses the selected system when cards are cached without shelf metadata", () => {
  mockLoadShelf.mockReturnValue([])
  mockLoadCards.mockReturnValue({ cards: [{ name: "Pikachu", quantity: 4 }] })
  expect(
    chosenDeckCards({ name: "Pikachu", versionId: "version", system: "pokemon" }, "owner"),
  ).toEqual([{ name: "Pikachu", quantity: 4, game: "pokemon" }])
})
