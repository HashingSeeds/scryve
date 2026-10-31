import { fireEvent, render, waitFor, within } from "@testing-library/react-native"

import CardsRoute from "@/app/cards"
import { clearCardDetails, saveCardDetails } from "@/features/decks/cardDetailsCache"
import type { GuestDeck } from "@/features/decks/guestDeck"
import { loadMatchSwaps } from "@/features/decks/matchSideboard"
import { createLocalGame, createNextMatchGame } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { saveListSnapshot } from "@/features/stats/listSnapshots"
import { ThemeProvider } from "@/theme/context"
import { clear as clearStorage } from "@/utils/storage"

import { GuestDeckDetailScreen } from "./GuestDeckDetailScreen"

const mockStatsQuery = jest.fn((..._args: unknown[]) => ({
  all: {
    games: 4,
    wins: 3,
    losses: 1,
    draws: 0,
    manualMatches: { total: 2, wins: 1, losses: 1, draws: 0 },
  },
  fingerprints: [],
}))
const mockGamesQuery = jest.fn((..._args: unknown[]) => ({ page: [] as unknown[] }))
const mockSearchCards = jest.fn()
const mockConvex = { action: mockSearchCards }
const mockConnectionState = { isWebSocketConnected: true }
jest.mock("convex/react", () => ({
  useConvex: () => mockConvex,
  // why: the deck capacity query is the only one called with empty args, and only recent results page.
  useQuery: (...args: unknown[]) =>
    JSON.stringify(args[1]) === "{}"
      ? { used: 1, limit: 2 }
      : JSON.stringify(args[1]).includes("paginationOpts")
        ? mockGamesQuery(...args)
        : mockStatsQuery(...args),
  useConvexConnectionState: () => mockConnectionState,
  useAction: () => mockSearchCards,
}))

const mockSync = jest.fn()
jest.mock("@/features/decks/localDeckSync", () => ({
  ...jest.requireActual("@/features/decks/localDeckSync"),
  useLocalDeckSync: () => ({ sync: mockSync, keepOnDevice: jest.fn() }),
}))

const mockStatsPush = jest.fn()
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockStatsPush(...args),
    back: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({
    deckId: "guest-11111111-1111-4111-8111-111111111111",
    game: "mtg",
  }),
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}))

const mockStored = {
  schemaVersion: 1 as const,
  localId: "11111111-1111-4111-8111-111111111111",
  createdAt: 1,
  updatedAt: 1,
  deck: {
    name: "Offline Commander",
    game: "mtg",
    format: "commander",
    note: "Keep this local",
    cards: [{ name: "Sol Ring", quantity: 2, board: "main" as const }],
  },
}
let mockCurrent: GuestDeck | undefined = mockStored
let mockSaveFailure = false
jest.mock("@/features/decks/guestDeck", () => ({
  isGuestDeckPayload: jest.requireActual("@/features/decks/guestDeck").isGuestDeckPayload,
  guestDeckRouteId: jest.requireActual("@/features/decks/guestDeck").guestDeckRouteId,
  guestDeckVersions: jest.requireActual("@/features/decks/guestDeck").guestDeckVersions,
  guestDeckBringing: jest.requireActual("@/features/decks/guestDeck").guestDeckBringing,
  useGuestDeck: (localId: string) => (mockCurrent?.localId === localId ? mockCurrent : undefined),
  loadGuestDeck: (localId: string) => (mockCurrent?.localId === localId ? mockCurrent : undefined),
  loadGuestDecks: () => (mockCurrent ? [mockCurrent] : []),
  saveGuestDeck: jest.fn((deck: typeof mockStored.deck) => {
    if (mockSaveFailure) throw new Error("Unable to save guest deck.")
    mockCurrent = { ...mockStored, updatedAt: 2, deck }
    return mockCurrent
  }),
  deleteGuestDeck: jest.fn(() => {
    mockCurrent = undefined
  }),
  addGuestDeckVersion: jest.fn(),
  updateGuestDeckVersion: jest.fn(),
  deleteGuestDeckVersion: jest.fn(),
  setGuestDeckBringing: jest.fn(),
}))

const mockGuestDeck = jest.requireMock("@/features/decks/guestDeck")
const mockSaveGuestDeck = mockGuestDeck.saveGuestDeck as jest.Mock
const mockDeleteGuestDeck = jest.requireMock("@/features/decks/guestDeck")
  .deleteGuestDeck as jest.Mock

function renderScreen(onBack = jest.fn(), localId = mockStored.localId) {
  return {
    onBack,
    ...render(
      <ThemeProvider initialContext="dark">
        <GuestDeckDetailScreen localId={localId} onBack={onBack} />
      </ThemeProvider>,
    ),
  }
}

const signedIn = {
  ready: true,
  loading: false,
  signedIn: true,
  ownerId: "owner-a",
  request: jest.fn(),
}

function renderSignedIn(access: typeof signedIn & { message?: string } = signedIn) {
  const onSynced = jest.fn()
  return {
    onSynced,
    ...render(
      <ThemeProvider initialContext="dark">
        <GuestDeckDetailScreen
          localId={mockStored.localId}
          access={access}
          onBack={jest.fn()}
          onSynced={onSynced}
        />
      </ThemeProvider>,
    ),
  }
}

beforeEach(() => {
  clearStorage()
  clearCardDetails()
  mockStatsQuery.mockClear()
  mockSearchCards.mockReset()
  mockConnectionState.isWebSocketConnected = true
  mockCurrent = mockStored
  mockSaveFailure = false
  mockSaveGuestDeck.mockClear()
  mockDeleteGuestDeck.mockClear()
  mockSync.mockReset()
})

test("changes a cached commander offline and saves both sections without changing the card count", async () => {
  mockCurrent = {
    ...mockStored,
    deck: {
      ...mockStored.deck,
      cards: [
        {
          name: "Sai",
          quantity: 1,
          scryfallId: "sai",
          board: "commander",
          imageUrl: "https://cards.example/sai.jpg",
        },
        {
          name: "Talrand",
          quantity: 1,
          scryfallId: "talrand",
          board: "main",
          imageUrl: "https://cards.example/talrand.jpg",
        },
        {
          name: "Mountain",
          quantity: 1,
          scryfallId: "mountain",
          board: "main",
          imageUrl: "https://cards.example/mountain.jpg",
        },
      ],
    },
  }
  saveCardDetails({
    sai: { commanderEligibility: "eligible", commanderLegality: "legal", colorIdentity: "U" },
    talrand: { commanderEligibility: "eligible", commanderLegality: "legal", colorIdentity: "U" },
    mountain: {
      commanderEligibility: "ineligible",
      commanderLegality: "legal",
      colorIdentity: "R",
    },
  })
  mockConnectionState.isWebSocketConnected = false
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-mode-build"))
  fireEvent.press(view.getByTestId("choose-commander"))
  expect(view.queryByLabelText("Preview Mountain as commander")).toBeNull()
  fireEvent.press(view.getByLabelText("Preview Talrand as commander"))
  await waitFor(() => expect(view.getByTestId("set-commander")).toBeEnabled())
  fireEvent.press(view.getByTestId("set-commander"))
  expect(view.getByText("Outside this commander's color identity: Mountain.")).toBeTruthy()
  fireEvent.press(view.getByLabelText("Remove Mountain"))
  expect(view.queryByText("Outside this commander's color identity: Mountain.")).toBeNull()
  fireEvent.press(view.getByText("Undo"))
  expect(view.getByText("Outside this commander's color identity: Mountain.")).toBeTruthy()
  fireEvent.press(view.getByTestId("save-version-button"))
  expect(mockSaveGuestDeck).toHaveBeenCalledWith(
    expect.objectContaining({
      cards: expect.arrayContaining([
        expect.objectContaining({ name: "Sai", quantity: 1, board: "main", section: "main" }),
        expect.objectContaining({
          name: "Talrand",
          quantity: 1,
          board: "commander",
          section: "commander",
        }),
        expect.objectContaining({ name: "Mountain", quantity: 1 }),
      ]),
    }),
    expect.anything(),
  )
  expect(mockSearchCards).not.toHaveBeenCalled()
  view.unmount()
  const reopened = renderScreen()
  fireEvent.press(reopened.getByTestId("deck-mode-build"))
  expect(reopened.getByTestId("deck-card-row-commander:talrand")).toBeTruthy()
  expect(reopened.getByText("Magic · Commander · 3 cards")).toBeTruthy()
})

function editNote(view: ReturnType<typeof renderScreen>, value: string) {
  fireEvent.press(view.getByTestId("deck-mode-build"))
  fireEvent.changeText(view.getByTestId("deck-note-input"), value)
}

test("opens in Play, edits notes in Build, and saves locally", () => {
  const view = renderScreen()
  expect(view.getByText("Offline Commander")).toBeTruthy()
  expect(view.queryByTestId("deck-note-input")).toBeNull()
  expect(view.queryByLabelText("Increase Sol Ring")).toBeNull()
  editNote(view, "New notes")
  fireEvent.press(view.getByTestId("save-version-button"))
  expect(mockSaveGuestDeck).toHaveBeenCalledWith(expect.objectContaining({ note: "New notes" }), {
    localId: mockStored.localId,
    version: 1,
  })
  view.unmount()
  const reloaded = renderScreen()
  fireEvent.press(reloaded.getByTestId("deck-mode-build"))
  expect(reloaded.getByDisplayValue("New notes")).toBeTruthy()
})

test("deck details edits the name without a duplicate notes field", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("deck-action-details"))
  expect(view.queryByTestId("deck-note-input")).toBeNull()
  fireEvent.changeText(view.getByTestId("deck-name-input"), "Renamed")
  fireEvent.press(view.getByTestId("deck-settings-save"))
  fireEvent.press(view.getByTestId("save-version-button"))
  expect(mockSaveGuestDeck).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Renamed", note: "Keep this local" }),
    expect.anything(),
  )
})

test("Play keeps the saved name until a settings rename is saved", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("deck-action-details"))
  fireEvent.changeText(view.getByTestId("deck-name-input"), "Renamed")
  fireEvent.press(view.getByTestId("deck-settings-save"))
  expect(view.getByText("Renamed")).toBeTruthy()
  fireEvent.press(view.getByTestId("deck-mode-play"))
  expect(view.getByText("Offline Commander")).toBeTruthy()
  expect(view.queryByText("Renamed")).toBeNull()
})

test("cancel keeps a guest deck and confirm deletes it", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("deck-action-delete"))
  fireEvent.press(view.getByTestId("confirm-dialog-cancel"))
  expect(mockDeleteGuestDeck).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("deck-action-delete"))
  fireEvent.press(view.getByTestId("guest-deck-confirm-delete"))
  expect(mockDeleteGuestDeck).toHaveBeenCalledTimes(1)
  expect(mockDeleteGuestDeck).toHaveBeenCalledWith(mockStored.localId)
})

test("syncs a device deck from the actions sheet", async () => {
  mockSync.mockResolvedValue({ status: "synced", deckId: "deck-9" })
  const view = renderSignedIn()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  const sheet = within(view.getByTestId("deck-actions-sheet"))
  expect(sheet.getAllByRole("button").map((row) => row.props.testID)).toEqual([
    "deck-action-details",
    "deck-action-sync",
    "deck-action-delete",
  ])
  expect(sheet.getByText("1 of 2 synced decks")).toBeTruthy()
  fireEvent.press(view.getByTestId("deck-action-sync"))
  await waitFor(() => expect(view.onSynced).toHaveBeenCalledWith("deck-9"))
  expect(mockSync).toHaveBeenCalledWith(mockStored.localId)
})

test("a deck from another account asks before adding it as new, after the sheet closes", async () => {
  const addAsNew = jest.fn().mockResolvedValue({ status: "synced", deckId: "deck-10" })
  mockSync.mockResolvedValue({ status: "other_account", addAsNew })
  const view = renderSignedIn()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("deck-action-sync"))
  fireEvent.press(await view.findByTestId("local-deck-add-as-new"))
  await waitFor(() => expect(view.onSynced).toHaveBeenCalledWith("deck-10"))
  expect(view.queryByTestId("deck-actions-sheet")).toBeNull()
})

test("offline, sync stays listed but blocked while rename and delete still work", () => {
  mockConnectionState.isWebSocketConnected = false
  const view = renderSignedIn({ ...signedIn, ready: false, message: "Reconnect to continue." })
  fireEvent.press(view.getByTestId("deck-settings-button"))
  const sync = view.getByTestId("deck-action-sync")
  expect(sync).toBeDisabled()
  expect(within(sync).getByText("Reconnect to continue.")).toBeTruthy()
  expect(view.getByTestId("deck-action-details")).toBeEnabled()
  expect(view.getByTestId("deck-action-delete")).toBeEnabled()
})

test("sync waits for unsaved edits to be saved or discarded", () => {
  const view = renderSignedIn()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("deck-action-details"))
  fireEvent.changeText(view.getByTestId("deck-name-input"), "Renamed")
  fireEvent.press(view.getByTestId("deck-settings-save"))
  fireEvent.press(view.getByTestId("deck-settings-button"))
  const sync = view.getByTestId("deck-action-sync")
  expect(sync).toBeDisabled()
  expect(within(sync).getByText("Save or discard your changes first.")).toBeTruthy()
})

test("shows only the deck it was opened for", () => {
  const view = renderScreen(jest.fn(), "22222222-2222-4222-8222-222222222222")
  expect(view.getByText("Local deck unavailable")).toBeTruthy()
  expect(view.queryByText("Offline Commander")).toBeNull()
})

test("retains a dirty draft on conflict and storage failure", () => {
  const view = renderScreen()
  editNote(view, "Unsaved")
  mockCurrent = { ...mockStored, updatedAt: 3 }
  fireEvent.press(view.getByTestId("save-version-button"))
  expect(view.getByTestId("guest-deck-error")).toHaveTextContent(/changed elsewhere/)
  expect(view.getByDisplayValue("Unsaved")).toBeTruthy()
  mockCurrent = mockStored
  mockSaveFailure = true
  fireEvent.press(view.getByTestId("save-version-button"))
  expect(view.getByTestId("guest-deck-error")).toHaveTextContent(/Unable to save/)
  expect(view.getByDisplayValue("Unsaved")).toBeTruthy()
})

test("supports removing the last copy, Undo, and discarding the draft", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-mode-build"))
  fireEvent.press(view.getByLabelText("Decrease Sol Ring"))
  fireEvent.press(view.getByLabelText("Remove Sol Ring"))
  expect(view.queryByText("Sol Ring")).toBeNull()
  fireEvent.press(view.getByText("Undo"))
  expect(view.getByText("Sol Ring")).toBeTruthy()
  expect(view.getByText("1 change")).toBeTruthy()
  fireEvent.press(view.getByTestId("deck-draft-discard"))
  fireEvent.press(view.getByTestId("deck-discard-confirm"))
  expect(view.getByLabelText("2× Sol Ring")).toBeTruthy()
  expect(view.queryByTestId("deck-draft-bar")).toBeNull()
  view.unmount()
  const reopened = renderScreen()
  fireEvent.press(reopened.getByTestId("deck-mode-build"))
  expect(reopened.getByLabelText("2× Sol Ring")).toBeTruthy()
})

test("keeps an unsaved edit after leaving and saves it from the reopened deck", () => {
  const first = renderScreen()
  editNote(first, "Unsaved")
  first.unmount()
  const reopened = renderScreen()
  expect(reopened.getByDisplayValue("Unsaved")).toBeTruthy()
  fireEvent.press(reopened.getByTestId("save-version-button"))
  expect(mockSaveGuestDeck).toHaveBeenCalledWith(
    expect.objectContaining({ note: "Unsaved" }),
    expect.anything(),
  )
  reopened.unmount()
  expect(renderScreen().queryByTestId("deck-draft-bar")).toBeNull()
})

test("adds from /cards into Main and Side, and the deck counts the changes", async () => {
  jest.useFakeTimers()
  try {
    mockSearchCards.mockResolvedValue([
      {
        name: "Island",
        scryfallId: "island",
        oracleId: "island-oracle",
        imageUrl: "https://cards.example/island.jpg",
        manaCost: "",
      },
    ])
    const view = render(
      <ThemeProvider initialContext="dark">
        <GuestDeckDetailScreen localId={mockStored.localId} onBack={jest.fn()} />
        <CardsRoute />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("deck-mode-build"))
    fireEvent.press(view.getByTestId("deck-add-cards"))
    expect(mockStatsPush).toHaveBeenCalledWith({
      pathname: "/cards",
      params: { deckId: `guest-${mockStored.localId}`, game: "mtg" },
    })
    fireEvent.changeText(view.getByTestId("card-search-input"), "Island")
    await waitFor(() => expect(view.getByLabelText("Add Island to deck")).toBeTruthy())
    fireEvent.press(view.getByLabelText("Add Island to deck"))
    fireEvent.press(view.getByLabelText("Add Island to deck"))
    fireEvent.press(view.getByLabelText("Add Island to Sideboard"))
    expect(view.getByText("2 in Main deck")).toBeTruthy()
    expect(view.getByText("1 in Sideboard")).toBeTruthy()
    expect(within(view.getByTestId("deck-draft-bar")).getByText("1 change")).toBeTruthy()

    fireEvent.press(view.getByTestId("save-version-button"))
    expect(mockSaveGuestDeck.mock.calls[0][0].cards).toEqual([
      expect.objectContaining({ name: "Sol Ring", quantity: 2 }),
      expect.objectContaining({ name: "Island", quantity: 2, section: "main" }),
      expect.objectContaining({ name: "Island", quantity: 1, section: "sideboard" }),
    ])
    expect(mockSaveGuestDeck.mock.calls[0][0].cards[1]).not.toHaveProperty("manaCost")
  } finally {
    jest.useRealTimers()
  }
})

test("loads rules text when opening a saved Magic card", async () => {
  mockCurrent = {
    ...mockStored,
    deck: {
      ...mockStored.deck,
      name: "Doom Prevails",
      cards: [{ name: "Molecule Man", quantity: 1, scryfallId: "molecule-man" }],
    },
  }
  mockSearchCards.mockResolvedValue({ oracleText: "Molecule Man rules text", typeLine: "Creature" })
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-mode-build"))
  fireEvent.press(view.getByLabelText("1× Molecule Man"))
  await waitFor(() => expect(view.getByText("Molecule Man rules text")).toBeTruthy())
  expect(mockSearchCards).toHaveBeenCalledWith({
    scryfallId: "molecule-man",
    deviceId: expect.any(String),
  })
})

test("shows lookup errors and retries when the saved card is reopened", async () => {
  mockCurrent = {
    ...mockStored,
    deck: {
      ...mockStored.deck,
      cards: [{ name: "Molecule Man", quantity: 1, scryfallId: "molecule-man" }],
    },
  }
  mockSearchCards.mockRejectedValueOnce(new Error("Card lookup unavailable"))
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-mode-build"))
  fireEvent.press(view.getByLabelText("1× Molecule Man"))
  await waitFor(() => expect(view.getByText("Could not load card details")).toBeTruthy())
  fireEvent.press(view.getAllByLabelText("Close card details")[0])
  mockSearchCards.mockResolvedValueOnce({ oracleText: "Molecule Man rules text" })
  fireEvent.press(view.getByLabelText("1× Molecule Man"))
  await waitFor(() => expect(view.getByText("Molecule Man rules text")).toBeTruthy())
})

test("Play brings the only version and starts a game with this deck", () => {
  const view = renderScreen()
  expect(view.getByTestId("deck-play")).toBeTruthy()
  expect(view.getByTestId("bring-version-1")).toBeChecked()
  expect(view.getByTestId("deck-play-no-results")).toHaveTextContent("No games yet")
  fireEvent.press(view.getByText("Start a game"))
  expect(mockStatsPush).toHaveBeenCalledWith({
    pathname: "/game/new",
    params: { deckId: `guest-${mockStored.localId}` },
  })
})

test("renders signed-in local deck stats by key as one record", () => {
  mockCurrent = { ...mockStored, deckKey: "stable-deck-key" }
  const view = render(
    <ThemeProvider initialContext="dark">
      <GuestDeckDetailScreen
        localId={mockStored.localId}
        onBack={jest.fn()}
        access={{
          ready: true,
          loading: false,
          signedIn: true,
          ownerId: "owner",
          request: jest.fn(),
        }}
      />
    </ThemeProvider>,
  )
  expect(mockStatsQuery).toHaveBeenCalledWith(expect.anything(), { deckKey: "stable-deck-key" })
  expect(view.getByText("Results · 4-2")).toBeTruthy()
  fireEvent.press(view.getByTestId("open-deck-stats"))
  expect(mockStatsPush).toHaveBeenCalledWith({
    pathname: "/connected/decks/stats",
    params: {
      deckKey: "stable-deck-key",
      deckName: "Offline Commander",
      game: "mtg",
      format: "commander",
    },
  })
})

test("does not query account stats while signed out", () => {
  renderScreen()
  expect(mockStatsQuery.mock.calls.every(([, args]) => args === "skip")).toBe(true)
})

test("moving a card to the sideboard and back leaves nothing to save", () => {
  const bolt = { name: "Bolt", quantity: 1, scryfallId: "bolt", board: "main" as const }
  mockCurrent = {
    ...mockStored,
    deck: {
      ...mockStored.deck,
      format: "modern",
      cards: [
        bolt,
        { name: "Path", quantity: 1, scryfallId: "path", board: "main" },
        { ...bolt, board: "sideboard" },
      ],
    },
  }
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-mode-build"))
  fireEvent.press(view.getByLabelText("Move one Bolt to Sideboard"))
  expect(view.getByTestId("deck-draft-bar")).toBeTruthy()
  fireEvent.press(view.getByLabelText("Move one Bolt to Main deck"))

  expect(view.queryByTestId("deck-draft-bar")).toBeNull()
})

describe("versions", () => {
  const bolt = { name: "Lightning Bolt", quantity: 4, board: "main" as const }
  const versioned = (count: number): GuestDeck => ({
    ...mockStored,
    versions: Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      name: index === 0 ? "Current" : `Tuned ${index}`,
      createdAt: 1,
      updatedAt: 1,
      ...(index === count - 1 ? {} : { cards: [bolt] }),
    })),
  })

  test("Play lists every version and stores the pick on the device deck", () => {
    mockCurrent = versioned(2)
    const view = renderScreen()
    expect(view.getByTestId("bring-version-2")).toBeChecked()
    expect(view.getByText("Version 1")).toBeTruthy()
    fireEvent.press(view.getByTestId("bring-version-1"))
    expect(mockGuestDeck.setGuestDeckBringing).toHaveBeenCalledWith(mockStored.localId, 1)
  })

  test("saves into the version picked in Build", () => {
    mockCurrent = versioned(2)
    const view = renderScreen()
    fireEvent.press(view.getByTestId("deck-mode-build"))
    fireEvent.press(view.getByTestId("deck-version-button"))
    fireEvent.press(view.getByTestId("version-picker-1"))
    expect(view.getByLabelText("4× Lightning Bolt")).toBeTruthy()
    editNote(view, "Older list")
    fireEvent.press(view.getByTestId("save-version-button"))
    expect(mockSaveGuestDeck).toHaveBeenCalledWith(
      expect.objectContaining({ cards: [bolt], note: "Older list" }),
      { localId: mockStored.localId, version: 1 },
    )
  })

  test("New version copies the cards below the limit and explains the limit at it", () => {
    const view = renderScreen()
    fireEvent.press(view.getByTestId("deck-mode-build"))
    fireEvent.press(view.getByTestId("deck-version-button"))
    fireEvent.press(view.getByTestId("version-picker-__new__"))
    fireEvent.changeText(view.getByTestId("version-name-input"), "Tuned")
    fireEvent.press(view.getByText("Create version"))
    expect(mockGuestDeck.addGuestDeckVersion).toHaveBeenCalledWith(
      mockStored.localId,
      { name: "Tuned", note: "", cards: mockStored.deck.cards },
      2,
    )
    view.unmount()

    mockCurrent = versioned(2)
    const full = renderScreen()
    fireEvent.press(full.getByTestId("deck-mode-build"))
    fireEvent.press(full.getByTestId("deck-version-button"))
    fireEvent.press(full.getByTestId("version-picker-__new__"))
    expect(
      within(full.getByTestId("deck-versions-dialog")).getByText(
        "This deck holds up to 2 versions. Delete one to add another.",
      ),
    ).toBeTruthy()
    fireEvent.press(full.getByTestId("deck-versions-backdrop"))
    expect(
      full.queryByText("This deck holds up to 2 versions. Delete one to add another."),
    ).toBeNull()
  })

  test("sync explains when the deck has more versions than the account keeps", () => {
    mockCurrent = versioned(3)
    const view = renderSignedIn()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    const sync = view.getByTestId("deck-action-sync")
    expect(sync).toBeDisabled()
    expect(
      within(sync).getByText("This deck has 3 versions. Free accounts keep 2. Delete 1 to sync."),
    ).toBeTruthy()
  })
})

test("sideboards a device deck between games of its local match", () => {
  const side = { name: "Negate", quantity: 1, scryfallId: "negate", board: "sideboard" as const }
  const main = { name: "Bolt", quantity: 1, scryfallId: "bolt", board: "main" as const }
  mockCurrent = {
    ...mockStored,
    deckKey: "device-key",
    deck: { ...mockStored.deck, format: "modern", cards: [main, side] },
  }
  const listFingerprint = `v1:${"a".repeat(64)}`
  saveListSnapshot("device-key", listFingerprint, [main, side])
  const first = createLocalGame({
    players: [
      { name: "Ada", color: "#41476E" },
      { name: "Grace", color: "#39755C" },
    ],
    startingLife: 20,
    system: "mtg",
    format: "modern",
    account: {
      ownerId: "owner-a",
      meSeat: 0,
      deckKey: "device-key",
      deckFingerprint: listFingerprint,
    },
    match: { bestOf: 3 },
  })
  new LocalGameRepository().saveActiveGame(
    createNextMatchGame({
      ...first,
      status: "finished",
      result: { kind: "win", winnerPlayerIds: [first.players[1].id] },
    }),
  )
  const view = renderSignedIn()
  expect(within(view.getByTestId("deck-play-match")).getByText("Main deck as built")).toBeTruthy()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  expect(
    within(view.getByTestId("deck-actions-sheet"))
      .getAllByRole("button")
      .map((row) => row.props.testID),
  ).toEqual([
    "deck-action-details",
    "deck-action-sync",
    "deck-action-sideboard",
    "deck-action-delete",
  ])
  fireEvent.press(view.getByTestId("deck-action-sideboard"))
  fireEvent.press(view.getByLabelText("Swap one more Negate"))
  fireEvent.press(view.getByLabelText("Swap one more Bolt"))
  fireEvent.press(view.getByTestId("sideboard-apply"))
  expect(within(view.getByTestId("deck-play-match")).getByText("+1 Negate")).toBeTruthy()
  expect(mockSaveGuestDeck).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("sideboard-reset"))
  expect(loadMatchSwaps(first.match?.id)).toEqual({ in: [], out: [] })
})
