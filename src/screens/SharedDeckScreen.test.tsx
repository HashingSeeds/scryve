import { fireEvent, render } from "@testing-library/react-native"

import { loadSharedDeck } from "@/features/decks/sharedDecks"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

import { SharedDeckScreen } from "./SharedDeckScreen"

const token = "s".repeat(43)
let mockShared: unknown
jest.mock("convex/react", () => ({
  useQuery: () => mockShared,
  useQueries: () => ({}),
  useConvex: () => undefined,
  useAction: () => jest.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}))
jest.mock("@/features/decks/localDeckSync", () => ({ useSaveNewDeck: () => jest.fn() }))

function renderScreen(onPlay = jest.fn()) {
  return render(
    <ThemeProvider initialContext="light">
      <SharedDeckScreen token={token} onBack={jest.fn()} onPlay={onPlay} onSaved={jest.fn()} />
    </ThemeProvider>,
  )
}

beforeEach(() => clear())

it("plays a shared deck without saving it as one of yours", () => {
  mockShared = {
    deckKey: `shared-${"b".repeat(32)}`,
    name: "Borrowed",
    game: "mtg",
    format: "commander",
    cards: [{ name: "Sol Ring", quantity: 1, section: "main" }],
  }
  const onPlay = jest.fn()
  const view = renderScreen(onPlay)
  expect(view.getByTestId("shared-deck-name").props.children).toBe("Borrowed")
  fireEvent.press(view.getByTestId("shared-deck-play"))
  expect(onPlay).toHaveBeenCalledWith(`shared-${"b".repeat(32)}`)
  expect(loadSharedDeck(token)?.deck).toMatchObject({ name: "Borrowed", format: "commander" })
})

it("says when a link no longer shares a deck", () => {
  mockShared = null
  expect(renderScreen().getByTestId("shared-deck-unavailable")).toBeTruthy()
})
