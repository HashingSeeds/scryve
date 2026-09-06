import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { Header } from "@/components/Header"
import type { GuestDeck } from "@/features/decks/guestDeck"
import { ThemeProvider } from "@/theme/context"

import { GuestDeckDetailScreen } from "./GuestDeckDetailScreen"

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
