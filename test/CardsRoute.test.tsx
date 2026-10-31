import { useState } from "react"
import { fireEvent, render } from "@testing-library/react-native"

import type { DeckCard } from "@/features/decks/deckCards"
import { useHostDeckSearch, type DeckSearchHost } from "@/features/decks/deckSearchHost"
import { ThemeProvider } from "@/theme/context"
import { load, save, storage } from "@/utils/storage"

import CardsRoute from "../src/app/cards"

let mockParams: { deckId?: string; game?: string } = {}
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock("convex/react", () => ({
  useConvex: () => undefined,
  useAction: () => jest.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}))
jest.mock("@/features/decks/useCardNameIndex", () => ({ useCardNameIndex: () => undefined }))

const island = { name: "Island", quantity: 1, scryfallId: "island", section: "main" }

function FrozenDeckScreen({ deckId }: { deckId: string }) {
  const [host] = useState(() => {
    let cards: DeckCard[] = [island]
    const listeners = new Set<() => void>()
    const frozen: DeckSearchHost = {
      game: "mtg",
      format: "modern",
      onAdd: (card) => {
        cards = cards.map((entry) =>
          entry.name === card.name ? { ...entry, quantity: entry.quantity + 1 } : entry,
        )
        listeners.forEach((listener) => listener())
        return undefined
      },
      onRemove: jest.fn(),
      cards: () => cards,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
    return frozen
  })
  useHostDeckSearch(deckId, host)
  return null
}

function renderRoute(deck?: string) {
  return render(
    <ThemeProvider initialContext="dark">
      {deck ? <FrozenDeckScreen deckId={deck} /> : null}
      <CardsRoute />
    </ThemeProvider>,
  )
}

beforeEach(() => storage.clearAll())

it("opens cold as a lookup and leaves the deck's saved draft alone", () => {
  const key = "scryve.decks.draft.v1.owner-a.deck-1"
  save(key, { draft: { editing: true, cards: [island], base: [] } })
  mockParams = { deckId: "deck-1", game: "mtg" }
  const view = renderRoute()

  expect(view.getByText("Cards")).toBeTruthy()
  expect(view.queryByText("Done")).toBeNull()
  fireEvent.changeText(view.getByTestId("card-search-input"), "Island")
  expect(view.queryByText("In this deck")).toBeNull()
  expect(load(key)).toEqual({ draft: { editing: true, cards: [island], base: [] } })
})

it("reads the deck's cards live while the deck screen under it is frozen", () => {
  mockParams = { deckId: "guest-local-1", game: "mtg" }
  const view = renderRoute("guest-local-1")

  expect(view.getByText("Add cards")).toBeTruthy()
  fireEvent.changeText(view.getByTestId("card-search-input"), "Island")
  expect(view.getByText("1 in Main deck")).toBeTruthy()
  fireEvent.press(view.getByLabelText("Add another Island"))
  expect(view.getByText("2 in Main deck")).toBeTruthy()
})
