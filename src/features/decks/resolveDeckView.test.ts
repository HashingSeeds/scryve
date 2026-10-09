import type { DeckCard } from "./deckCards"
import { addDraftCard, closedDeckDraft, openDeckDraft } from "./deckDraft"
import type { SyncedDeck } from "./decksSync"
import type { PendingDeckWrite } from "./decksSyncWrites"
import type { PendingVersionWrite } from "./decksVersionWrites"
import { DECK_CONFLICT_REASON } from "./deckSyncReasons"
import type { StoredVersion } from "./deckVersionsCache"
import { deckQueryVersionId, resolveDeckView, type DeckViewInput } from "./resolveDeckView"
import type { Id } from "../../../convex/_generated/dataModel"

const deckId = "deck-1" as Id<"decks">
const versionId = "version-1" as Id<"deckVersions">
const provisionalId = "draft-1" as Id<"deckVersions">
const card = (name: string, quantity = 1): DeckCard => ({ name, quantity, scryfallId: name })
const row = (name: string, quantity = 1) => ({
  ...card(name, quantity),
  _id: `card-${name}` as Id<"deckCards">,
  _creationTime: 0,
  deckVersionId: versionId,
})
const names = (cards: readonly DeckCard[]) =>
  cards.map((entry) => `${entry.quantity} ${entry.name}`)

const syncedDeck = (overrides: Partial<SyncedDeck> = {}): SyncedDeck => ({
  id: deckId,
  deckId,
  revision: 4,
  name: "Talrand",
  format: "commander",
  game: "mtg",
  note: "",
  deleted: false,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})
const storedVersion = (overrides: Partial<StoredVersion> = {}): StoredVersion => ({
  deckId,
  versionId,
  revision: 2,
  versionNumber: 1,
  name: "Main",
  note: "",
  fingerprint: "f1",
  cardCount: 1,
  cardQuantity: 1,
  deleted: false,
  updatedAt: 1,
  ...overrides,
})
const pendingCards = (
  cards: DeckCard[],
  overrides: Partial<PendingVersionWrite> = {},
): PendingVersionWrite => ({
  schemaVersion: 1,
  queuedAt: 1,
  attempts: 0,
  ownerId: "owner-a",
  deckId,
  versionId,
  operationId: "op-1",
  expectedRevision: 2,
  cards,
  ...overrides,
})
const pendingMetadata = (overrides: Partial<PendingDeckWrite> = {}): PendingDeckWrite => ({
  schemaVersion: 1,
  queuedAt: 1,
  attempts: 0,
  ownerId: "owner-a",
  id: deckId,
  deckId,
  operationId: "op-meta",
  expectedRevision: 4,
  name: "Talrand",
  format: "commander",
  game: "mtg",
  note: "",
  deleted: false,
  ...overrides,
})

function detail(cards = [row("Island", 2)]): NonNullable<DeckViewInput["detail"]> {
  return {
    deck: {
      _id: deckId,
      _creationTime: 0,
      ownerUserId: "user-1" as Id<"users">,
      name: "Talrand",
      format: "commander",
      game: "mtg",
      note: "Server note",
      createdAt: 1,
      updatedAt: 1,
    },
    versions: [
      {
        _id: versionId,
        versionNumber: 1,
        name: "Main",
        note: undefined,
        cardCount: cards.length,
        cardQuantity: 2,
        createdAt: 1,
        updatedAt: 1,
        record: undefined,
      },
    ],
    version: {
      _id: versionId,
      _creationTime: 0,
      deckId,
      versionNumber: 1,
      fingerprint: "f1",
      syncRevision: 2,
      createdAt: 1,
    },
    cards,
    capacity: { used: 1, limit: 1, premium: false, canCreate: false },
    record: undefined,
    analyticsLocked: true,
  }
}

function input(overrides: Partial<DeckViewInput> = {}): DeckViewInput {
  return {
    deckId,
    detail: undefined,
    draft: closedDeckDraft,
    sync: { enabled: true, ownerId: "owner-a" },
    syncedMetadata: [],
    metadataWrites: { metadata: [], pending: [], failures: [], capacityBlocked: false },
    versionWrites: {
      pending: [],
      failures: [],
      capacityBlocked: false,
      mappedVersion: (id) => id,
    },
    versionCache: { versions: [], version: undefined, cards: undefined },
    selectedVersionId: undefined,
    loadCardDetails: () => ({}),
    ...overrides,
  }
}

describe("resolveDeckView cards", () => {
  it("renders the live server list, merging rows that share a printing", () => {
    const view = resolveDeckView(input({ detail: detail([row("Island", 2), row("Island", 1)]) }))
    expect(names(view.cards)).toEqual(["3 Island"])
    expect(view).toMatchObject({
      cardsUnavailable: false,
      cardsCached: false,
      versionTarget: { versionId, expectedRevision: 2 },
    })
  })

  it("shows the newest pending card write over the server list", () => {
    const view = resolveDeckView(
      input({
        detail: detail(),
        versionWrites: {
          pending: [
            pendingCards([card("Swamp")], { expectedRevision: 2 }),
            pendingCards([card("Forest")], { expectedRevision: 3, operationId: "op-2" }),
            pendingCards([card("Mountain")], { op: "rename", expectedRevision: 9 }),
          ],
          failures: [],
          capacityBlocked: false,
          mappedVersion: (id) => id,
        },
      }),
    )
    expect(names(view.cards)).toEqual(["1 Forest"])
    expect(view.saveStatus).toBe("Saved locally · Pending sync")
  })

  it("keeps a pending write queued under a provisional id on its acknowledged version", () => {
    const view = resolveDeckView(
      input({
        detail: detail(),
        versionWrites: {
          pending: [pendingCards([card("Swamp")], { versionId: provisionalId })],
          failures: [],
          capacityBlocked: false,
          mappedVersion: (id) => (id === provisionalId ? versionId : id),
        },
      }),
    )
    expect(names(view.cards)).toEqual(["1 Swamp"])
  })

  it("falls back to the cached version offline and targets its revision", () => {
    const view = resolveDeckView(
      input({
        versionCache: {
          versions: [storedVersion()],
          version: storedVersion({ revision: 7 }),
          cards: [row("Island")],
        },
      }),
    )
    expect(names(view.cards)).toEqual(["1 Island"])
    expect(view).toMatchObject({
      cardsCached: true,
      cardsUnavailable: false,
      versionTarget: { versionId, expectedRevision: 7 },
    })
  })

  it("marks cards unavailable when neither the server nor the cache has them", () => {
    const view = resolveDeckView(input())
    expect(view).toMatchObject({ cards: [], cardsUnavailable: true, versionCapture: undefined })
  })

  it("renders the open draft and its unsaved changes", () => {
    const draft = addDraftCard(
      openDeckDraft({ cards: [card("Island", 2)], note: "Server note", fromCache: false }),
      card("Swamp"),
    )
    const view = resolveDeckView(input({ detail: detail(), draft }))
    expect(names(view.cards)).toEqual(["2 Island", "1 Swamp"])
    expect(names(view.displayCards)).toEqual(["2 Island"])
    expect(view.changes).toEqual({ cards: true, note: false, any: true })
  })
})

describe("resolveDeckView metadata and status", () => {
  it("prefers a pending local edit over the server deck", () => {
    const view = resolveDeckView(
      input({
        detail: detail(),
        metadataWrites: {
          metadata: [syncedDeck({ name: "Renamed", revision: 5 })],
          pending: [pendingMetadata({ name: "Renamed" })],
          failures: [],
          capacityBlocked: false,
        },
      }),
    )
    expect(view.deck?.name).toBe("Renamed")
    expect(view.currentMetadataRevision).toBe(5)
    expect(view.canQueueMetadata).toBe(true)
  })

  it("shows nothing from the device cache when sync is off", () => {
    const view = resolveDeckView(
      input({ sync: { enabled: false }, syncedMetadata: [syncedDeck()] }),
    )
    expect(view.deck).toBeUndefined()
    expect(view.saveStatus).toBeUndefined()
  })

  it("knows a deck deleted on another device", () => {
    const view = resolveDeckView(input({ syncedMetadata: [syncedDeck({ deleted: true })] }))
    expect(view.knownDeleted).toBe(true)
  })

  it("compares only the changed fields of a conflicted edit and hides raw server errors", () => {
    const failure = {
      schemaVersion: 1 as const,
      action: pendingMetadata({ name: "Mine", note: "Same" }),
      reason: DECK_CONFLICT_REASON,
      failedAt: 2,
    }
    const view = resolveDeckView(
      input({
        metadataWrites: {
          metadata: [syncedDeck({ name: "Theirs", note: "Same" })],
          pending: [],
          failures: [failure],
          capacityBlocked: false,
        },
      }),
    )
    expect(view.versionConflict).toBe(true)
    expect(view.comparedFields).toEqual([{ label: "Name", local: "Mine", account: "Theirs" }])
    expect(view.saveStatus).toBe("Local edit not synced")

    const raw = resolveDeckView(
      input({
        metadataWrites: {
          metadata: [syncedDeck()],
          pending: [],
          failures: [{ ...failure, reason: "[CONVEX M(decks:syncWrite)] Server Error" }],
          capacityBlocked: false,
        },
      }),
    )
    expect(raw.failureMessage).toBe("This edit could not be synced. Try again or discard it.")
  })

  it("reads card details for commander warnings only after a commander choice", () => {
    const loadCardDetails = jest.fn(() => ({}))
    const commander = { ...card("Talrand"), section: "commander" }
    const draft = openDeckDraft({ cards: [commander], note: "", fromCache: false })
    resolveDeckView(input({ detail: detail(), draft, loadCardDetails }))
    expect(loadCardDetails).not.toHaveBeenCalled()

    const view = resolveDeckView(
      input({ detail: detail(), draft: { ...draft, commanderSelected: true }, loadCardDetails }),
    )
    expect(loadCardDetails).toHaveBeenCalled()
    expect(view.commanderWarnings).toEqual([
      "Some card details are missing. Deck color identity has not been fully checked.",
    ])
    expect(view.singleCommander).toBe(true)
  })
})

describe("deckQueryVersionId", () => {
  it("reads the default version until a provisional offline version is acknowledged", () => {
    const provisional = [storedVersion({ versionId: provisionalId, local: true })]
    expect(deckQueryVersionId(provisionalId, provisionalId, provisional)).toBeUndefined()
    expect(deckQueryVersionId(provisionalId, versionId, provisional)).toBe(versionId)
    expect(deckQueryVersionId(undefined, undefined, [])).toBeUndefined()
  })
})
