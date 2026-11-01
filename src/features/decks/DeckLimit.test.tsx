import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { ThemeProvider } from "@/theme/context"

import { DeckLimitDialog } from "./DeckLimit"

const mockMove = jest.fn()
let mockCapacity = { used: 2, limit: 2, premium: false, canCreate: false }
const mockDeck = {
  _id: "deck-1",
  name: "Elves",
  game: "mtg",
  format: "commander",
  cardQuantity: 100,
}
jest.mock("../../../convex/_generated/api", () => ({
  api: { decks: { capacity: "capacity", listMine: "listMine" } },
}))
jest.mock("convex/react", () => ({
  useQuery: (reference: string) =>
    reference === "capacity" ? mockCapacity : { decks: [mockDeck] },
}))
jest.mock("./localDeckSync", () => ({
  useLocalDeckSync: () => ({ keepOnDevice: mockMove }),
  useDecksWithQueuedEdits: () => new Set(),
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: jest.fn() }),
}))
const access: CloudAccess = {
  ready: true,
  loading: false,
  signedIn: true,
  ownerId: "owner",
  request: jest.fn(),
}
function dialog(onRoomMade: () => void) {
  return (
    <ThemeProvider initialContext="dark">
      <DeckLimitDialog access={access} onClose={jest.fn()} onRoomMade={onRoomMade} />
    </ThemeProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCapacity = { used: 2, limit: 2, premium: false, canCreate: false }
})

test("never continues when room is freed externally", () => {
  const onRoomMade = jest.fn()
  const view = render(dialog(onRoomMade))
  mockCapacity = { ...mockCapacity, used: 1, canCreate: true }
  view.rerender(dialog(onRoomMade))
  expect(onRoomMade).not.toHaveBeenCalled()
})

test("continues only after this dialog successfully moves a deck", async () => {
  const onRoomMade = jest.fn()
  mockMove.mockResolvedValue("local-id")
  const view = render(dialog(onRoomMade))
  fireEvent.press(view.getByTestId("deck-limit-move"))
  expect(view.getByText("Commander · 100 cards")).toBeTruthy()
  fireEvent.press(view.getByText("Elves"))
  expect(onRoomMade).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("deck-limit-confirm-move"))
  await waitFor(() => expect(onRoomMade).toHaveBeenCalledTimes(1))
  expect(mockMove).toHaveBeenCalledWith("deck-1")
})

test("does not continue when moving is refused", async () => {
  const onRoomMade = jest.fn()
  mockMove.mockRejectedValue(
    new ConvexError({ code: "sync_conflict", message: "Deck changed on another device" }),
  )
  const view = render(dialog(onRoomMade))
  fireEvent.press(view.getByTestId("deck-limit-move"))
  fireEvent.press(view.getByText("Elves"))
  fireEvent.press(view.getByTestId("deck-limit-confirm-move"))
  await waitFor(() => expect(view.getByText("Deck changed on another device")).toBeTruthy())
  expect(onRoomMade).not.toHaveBeenCalled()
})
