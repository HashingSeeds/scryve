import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { Header } from "@/components/Header"
import type { GuestDeck } from "@/features/decks/guestDeck"
import { ThemeProvider } from "@/theme/context"

import { GuestDeckDetailScreen } from "./GuestDeckDetailScreen"

const mockSearchCards = jest.fn()
const mockConvex = { action: mockSearchCards }
jest.mock("convex/react", () => ({ useConvex: () => mockConvex, useAction: () => mockSearchCards }))

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

function editNote(view: ReturnType<typeof renderScreen>, value: string) {
  fireEvent.press(view.getByTestId("deck-tab-notes"))
  fireEvent.press(view.getByText("Edit notes"))
  fireEvent.changeText(view.getByTestId("deck-note-input"), value)
}

test("opens read-only, edits notes in the deck view, and saves locally", () => {
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
  fireEvent.press(reloaded.getByTestId("deck-tab-notes"))
  expect(reloaded.getByText("New notes")).toBeTruthy()
})

test("deck details edits the name without a duplicate notes field", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  expect(view.queryByTestId("deck-note-input")).toBeNull()
  fireEvent.changeText(view.getByTestId("deck-name-input"), "Renamed")
  fireEvent.press(view.getByTestId("deck-settings-save"))
  fireEvent.press(view.getByTestId("save-version-button"))
  expect(mockSaveGuestDeck).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Renamed", note: "Keep this local" }),
    expect.anything(),
  )
})

test("cancel keeps a guest deck and confirm deletes it", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("delete-deck-button"))
  fireEvent.press(view.getByTestId("confirm-dialog-cancel"))
  expect(mockDeleteGuestDeck).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("deck-settings-button"))
  fireEvent.press(view.getByTestId("delete-deck-button"))
  fireEvent.press(view.getByTestId("guest-deck-confirm-delete"))
  expect(mockDeleteGuestDeck).toHaveBeenCalledTimes(1)
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

test("supports removing the last copy, Undo, and cancelling an edit", () => {
  const view = renderScreen()
  fireEvent.press(view.getByTestId("edit-deck-button"))
  fireEvent.press(view.getByLabelText("Decrease Sol Ring"))
  fireEvent.press(view.getByLabelText("Remove Sol Ring"))
  expect(view.queryByText("Sol Ring")).toBeNull()
  fireEvent.press(view.getByText("Undo"))
  expect(view.getByText("Sol Ring")).toBeTruthy()
  fireEvent(view.UNSAFE_getByType(Header), "leftPress")
  fireEvent.press(view.getByTestId("guest-deck-discard-confirm"))
  expect(view.getByText("2×")).toBeTruthy()
  expect(view.onBack).not.toHaveBeenCalled()
})

test("blocks system back and replays navigation after discard", () => {
  const view = renderScreen()
  editNote(view, "Unsaved")
  const action = { type: "GO_BACK" }
  act(() => mockPreventRemoveCallback?.({ data: { action } }))
  fireEvent.press(view.getByText("Keep editing"))
  expect(mockPreventRemove).toBe(true)
  act(() => mockPreventRemoveCallback?.({ data: { action } }))
  fireEvent.press(view.getByTestId("guest-deck-discard-confirm"))
  expect(mockNavigationDispatch).toHaveBeenCalledWith(action)
})

test("searches new cards into Main deck by default and saves merged copies", async () => {
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
  expect(mockSearchCards).toHaveBeenCalledWith({ scryfallId: "molecule-man" })
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
