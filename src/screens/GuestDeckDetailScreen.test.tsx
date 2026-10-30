import { fireEvent, render, waitFor, within } from "@testing-library/react-native"

import { clearCardDetails, saveCardDetails } from "@/features/decks/cardDetailsCache"
import type { GuestDeck } from "@/features/decks/guestDeck"
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
const mockSearchCards = jest.fn()
const mockConvex = { action: mockSearchCards }
const mockConnectionState = { isWebSocketConnected: true }
jest.mock("convex/react", () => ({
  useConvex: () => mockConvex,
  // why: the deck capacity query is the only one called with empty args.
  useQuery: (...args: unknown[]) =>
    JSON.stringify(args[1]) === "{}" ? { used: 1, limit: 2 } : mockStatsQuery(...args),
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
  router: { push: (...args: unknown[]) => mockStatsPush(...args) },
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
  useGuestDeck: (localId: string) => (mockCurrent?.localId === localId ? mockCurrent : undefined),
  loadGuestDeck: (localId: string) => (mockCurrent?.localId === localId ? mockCurrent : undefined),
  saveGuestDeck: jest.fn((deck: typeof mockStored.deck) => {
    if (mockSaveFailure) throw new Error("Unable to save guest deck.")
    mockCurrent = { ...mockStored, updatedAt: 2, deck }
    return mockCurrent
  }),
  deleteGuestDeck: jest.fn(() => {
    mockCurrent = undefined
  }),
}))

const mockSaveGuestDeck = jest.requireMock("@/features/decks/guestDeck").saveGuestDeck as jest.Mock
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
  })
  view.unmount()
  const reloaded = renderScreen()
  expect(reloaded.getByText("New notes")).toBeTruthy()
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
  expect(renderScreen().getByText("2×")).toBeTruthy()
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

test("searches new cards into Main deck by default and saves merged copies", async () => {
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
    const view = renderScreen()
    fireEvent.press(view.getByTestId("deck-mode-build"))
    fireEvent.press(view.getByTestId("deck-add-cards"))
    fireEvent.changeText(view.getByTestId("card-search-input"), "Island")
    await waitFor(() => expect(view.getByLabelText("Add Island to deck")).toBeTruthy())
    fireEvent.press(view.getByLabelText("Add Island to deck"))
    fireEvent.press(view.getByLabelText("Add Island to deck"))
    fireEvent.press(view.getByText("Done"))
    fireEvent.press(view.getByTestId("save-version-button"))
    expect(mockSaveGuestDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ name: "Island", quantity: 2, section: "main" }),
        ]),
      }),
      expect.anything(),
    )
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
  fireEvent.press(view.getByLabelText("1× Molecule Man"))
  await waitFor(() => expect(view.getByText("Could not load card details")).toBeTruthy())
  fireEvent.press(view.getAllByLabelText("Close card details")[0])
  mockSearchCards.mockResolvedValueOnce({ oracleText: "Molecule Man rules text" })
  fireEvent.press(view.getByLabelText("1× Molecule Man"))
  await waitFor(() => expect(view.getByText("Molecule Man rules text")).toBeTruthy())
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
  expect(view.getByText("4-2")).toBeTruthy()
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
