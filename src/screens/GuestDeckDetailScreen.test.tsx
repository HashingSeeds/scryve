import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { Header } from "@/components/Header"
import type { GuestDeck } from "@/features/decks/guestDeck"
import { ThemeProvider } from "@/theme/context"

import { GuestDeckDetailScreen } from "./GuestDeckDetailScreen"

const mockSearchCards = jest.fn()
const mockConvex = { action: mockSearchCards }
jest.mock("convex/react", () => ({ useConvex: () => mockConvex }))

let mockPreventRemove = false
let mockPreventRemoveCallback:
  ((options: { data: { action: { type: string } } }) => void) | undefined
const mockNavigationDispatch = jest.fn()
const mockNavigation = { dispatch: mockNavigationDispatch }
jest.mock("expo-router", () => ({ useNavigation: () => mockNavigation }))
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (preventRemove: boolean, callback: typeof mockPreventRemoveCallback) => {
    mockPreventRemove = preventRemove
    mockPreventRemoveCallback = callback
  },
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
  useGuestDeck: () => mockCurrent,
  loadGuestDeck: () => mockCurrent,
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

function renderScreen(onBack = jest.fn()) {
  return {
    onBack,
    ...render(
      <ThemeProvider initialContext="dark">
        <GuestDeckDetailScreen onBack={onBack} />
      </ThemeProvider>,
    ),
  }
}

beforeEach(() => {
  mockSearchCards.mockReset()
  mockPreventRemove = false
  mockPreventRemoveCallback = undefined
  mockNavigationDispatch.mockClear()
  mockCurrent = mockStored
  mockSaveFailure = false
  mockSaveGuestDeck.mockClear()
  mockDeleteGuestDeck.mockClear()
})

test("shows stored cards and saves edits across reload", async () => {
  const view = renderScreen()
  await waitFor(() => expect(view.getByDisplayValue("Offline Commander")).toBeTruthy())
  expect(view.getByText("Sol Ring")).toBeTruthy()
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Renamed")
  fireEvent.press(view.getByTestId("guest-card-0-increase"))
  fireEvent.press(view.getByTestId("guest-deck-save"))

  expect(mockSaveGuestDeck).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Renamed",
      cards: [{ name: "Sol Ring", quantity: 3, board: "main" }],
    }),
    { localId: mockStored.localId },
  )
  view.unmount()
  const reloaded = renderScreen()
  await waitFor(() => expect(reloaded.getByDisplayValue("Renamed")).toBeTruthy())
})

test("cancel keeps a guest deck and confirm deletes it", async () => {
  const onBack = jest.fn()
  const view = renderScreen(onBack)
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Unsaved before deletion")
  fireEvent.press(view.getByTestId("guest-deck-delete"))
  await waitFor(() => expect(view.getByTestId("guest-deck-confirm-delete")).toBeTruthy())
  fireEvent.press(view.getByTestId("confirm-dialog-cancel"))
  expect(mockDeleteGuestDeck).not.toHaveBeenCalled()
  expect(view.getByText("Sol Ring")).toBeTruthy()

  fireEvent.press(view.getByTestId("guest-deck-delete"))
  await waitFor(() => expect(view.getByTestId("guest-deck-confirm-delete")).toBeTruthy())
  fireEvent.press(view.getByTestId("guest-deck-confirm-delete"))
  expect(mockDeleteGuestDeck).toHaveBeenCalledTimes(1)
  expect(onBack).toHaveBeenCalledTimes(1)
})

test("keeps a dirty draft when saving hits a revision conflict", () => {
  const view = renderScreen()
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Unsaved")
  mockCurrent = { ...mockStored, updatedAt: 3 }
  fireEvent.press(view.getByTestId("guest-deck-save"))
  expect(view.getByDisplayValue("Unsaved")).toBeTruthy()
  expect(view.getByTestId("guest-deck-error")).toHaveTextContent(/changed elsewhere/i)
})

test("keeps entered draft when saving fails", () => {
  const view = renderScreen()
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Still here")
  mockSaveFailure = true
  fireEvent.press(view.getByTestId("guest-deck-save"))
  expect(view.getByDisplayValue("Still here")).toBeTruthy()
  expect(view.getByTestId("guest-deck-error")).toHaveTextContent(/Unable to save/i)
})

test.each([
  ["ygo", "Dark Magician", "https://ygo-images.example/dark-magician.jpg"],
  ["pokemon", "Riolu", "https://assets.example/riolu/high.webp"],
] as const)("shows and focuses a local %s card image", (game, name, imageUrl) => {
  mockCurrent = {
    ...mockStored,
    deck: {
      ...mockStored.deck,
      game,
      cards: [{ name, quantity: 1, section: "main", imageUrl, smallImageUrl: imageUrl }],
    },
  }
  const view = renderScreen()

  expect(view.getByTestId("guest-card-0-image")).toBeTruthy()
  expect(view.getByTestId("guest-card-0-thumbnail").props.source).toEqual([{ uri: imageUrl }])
  fireEvent.press(view.getByTestId("guest-card-0-image"))

  expect(view.getByTestId("card-focus-image").props.source).toEqual([{ uri: imageUrl }])
  expect(view.queryByText("Loading details…")).toBeNull()
  fireEvent.press(view.getByTestId("card-focus-increment"))
  expect(view.getByText("2× in main")).toBeTruthy()
})

test("keeps unsaved edits until back navigation is confirmed", () => {
  const { onBack, ...view } = renderScreen()
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Unsaved")
  fireEvent(view.UNSAFE_getByType(Header), "leftPress")
  expect(onBack).not.toHaveBeenCalled()
  fireEvent.press(view.getByText("Keep editing"))
  expect(view.getByDisplayValue("Unsaved")).toBeTruthy()
  fireEvent(view.UNSAFE_getByType(Header), "leftPress")
  fireEvent.press(view.getByTestId("guest-deck-discard-confirm"))
  expect(onBack).toHaveBeenCalledTimes(1)
})

test("blocks system back until discard is confirmed and replays the original action", () => {
  const { onBack, ...view } = renderScreen()
  expect(mockPreventRemove).toBe(false)
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Unsaved")
  expect(mockPreventRemove).toBe(true)
  const action = { type: "GO_BACK" }
  act(() => mockPreventRemoveCallback?.({ data: { action } }))
  expect(view.getByText("Discard changes?")).toBeTruthy()
  expect(mockNavigationDispatch).not.toHaveBeenCalled()
  fireEvent.press(view.getByText("Keep editing"))
  expect(view.getByDisplayValue("Unsaved")).toBeTruthy()
  expect(mockPreventRemove).toBe(true)
  act(() => mockPreventRemoveCallback?.({ data: { action } }))
  fireEvent.press(view.getByTestId("guest-deck-discard-confirm"))
  expect(mockPreventRemove).toBe(false)
  expect(mockNavigationDispatch).toHaveBeenCalledTimes(1)
  expect(mockNavigationDispatch).toHaveBeenCalledWith(action)
  expect(onBack).not.toHaveBeenCalled()
})

test("saving after cancelling system back keeps the editor open", () => {
  const view = renderScreen()
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Saved")
  expect(mockPreventRemove).toBe(true)
  act(() => mockPreventRemoveCallback?.({ data: { action: { type: "GO_BACK" } } }))
  fireEvent.press(view.getByText("Keep editing"))
  fireEvent.press(view.getByTestId("guest-deck-save"))
  expect(mockPreventRemove).toBe(false)
  expect(mockNavigationDispatch).not.toHaveBeenCalled()
  expect(view.getByDisplayValue("Saved")).toBeTruthy()
})

test("removes all copies of a card from the list and saves the draft", () => {
  const view = renderScreen()
  fireEvent.press(view.getByLabelText("Remove Sol Ring from deck"))
  expect(view.queryByText("Sol Ring")).toBeNull()
  expect(view.getByText("Cards (0)")).toBeTruthy()
  fireEvent.press(view.getByTestId("guest-deck-save"))
  expect(mockSaveGuestDeck).toHaveBeenCalledWith(expect.objectContaining({ cards: [] }), {
    localId: mockStored.localId,
  })
})

test.each([
  {
    game: "mtg",
    card: { name: "Island", scryfallId: "island-print", oracleId: "island", manaCost: "" },
  },
  {
    game: "pokemon",
    card: {
      name: "Charizard",
      cardId: "base1-4",
      printingId: "base1-4",
      game: "pokemon",
      faces: [],
      facets: {},
    },
  },
])("adds new $game cards from search and saves only deck fields", async ({ game, card }) => {
  mockCurrent = { ...mockStored, deck: { ...mockStored.deck, game, format: "standard", cards: [] } }
  mockSearchCards.mockResolvedValue([{ ...card, imageUrl: "https://cards.example/card.jpg" }])
  const view = renderScreen()
  fireEvent.press(view.getByTestId("guest-deck-add-cards"))
  fireEvent.changeText(view.getByTestId("guest-card-search-input"), card.name)
  fireEvent.press(view.getByTestId("guest-card-search"))
  await waitFor(() => expect(view.getByLabelText(`Add ${card.name} to deck`)).toBeTruthy())
  expect(mockSearchCards).toHaveBeenCalledWith(expect.anything(), { game, query: card.name })
  fireEvent.press(view.getByLabelText(`Add ${card.name} to deck`))
  fireEvent.press(view.getByLabelText(`Add ${card.name} to deck`))
  fireEvent.press(view.getByText("Done"))
  expect(view.getByText("Cards (2)")).toBeTruthy()
  fireEvent.press(view.getByTestId("guest-deck-save"))
  const savedCards = mockSaveGuestDeck.mock.calls[0][0].cards
  expect(savedCards).toHaveLength(1)
  expect(savedCards[0]).toMatchObject({ name: card.name, quantity: 2, section: "main" })
  expect(savedCards[0]).not.toHaveProperty("manaCost")
  expect(savedCards[0]).not.toHaveProperty("faces")
  expect(savedCards[0]).not.toHaveProperty("facets")
})

test("keeps edits after a failed search and lets guests retry", async () => {
  mockSearchCards.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([])
  const view = renderScreen()
  fireEvent.changeText(view.getByTestId("guest-deck-name"), "Unsaved")
  fireEvent.press(view.getByTestId("guest-deck-add-cards"))
  fireEvent.changeText(view.getByTestId("guest-card-search-input"), "Island")
  fireEvent.press(view.getByTestId("guest-card-search"))
  await waitFor(() => expect(view.getByText(/Check your connection/)).toBeTruthy())
  fireEvent.press(view.getByTestId("guest-card-search"))
  await waitFor(() => expect(view.getByText("No cards found.")).toBeTruthy())
  fireEvent.press(view.getByText("Done"))
  expect(view.getByDisplayValue("Unsaved")).toBeTruthy()
  expect(view.getByText("Sol Ring")).toBeTruthy()
})
