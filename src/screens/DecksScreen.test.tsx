import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { colors } from "@/theme/colors"
import { ThemeProvider } from "@/theme/context"

import { DecksScreen } from "./DecksScreen"

type ShelfState = {
  decks: Array<{
    _id: string
    name: string
    format: string
    game: string
    versionCount: number
    cardQuantity?: number
    coverImageUrl?: string
    record?: { games: number; wins: number; losses: number; draws: number; unknown: number }
  }>
  capacity: { used: number; limit: number; premium: boolean; canCreate: boolean }
  analyticsLocked: boolean
}

const commanderDeck = {
  _id: "existing-deck",
  name: "Existing Deck",
  format: "commander",
  game: "mtg",
  versionCount: 3,
  cardQuantity: 100,
  coverImageUrl: undefined,
  lastPlayedAt: 100,
  record: { games: 4, wins: 3, losses: 1, draws: 0, unknown: 0 },
}

const standardDeck = {
  _id: "standard-deck",
  name: "Mono Red",
  format: "standard",
  game: "mtg",
  versionCount: 1,
  cardQuantity: 60,
  coverImageUrl: undefined,
}

const mockListMine: { value: ShelfState | undefined } = {
  value: {
    decks: [commanderDeck, standardDeck],
    capacity: { used: 2, limit: 100, premium: true, canCreate: true },
    analyticsLocked: false,
  },
}

jest.mock("convex/react", () => ({
  useQuery: () => mockListMine.value,
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    decks: {
      listMine: "decks.listMine",
    },
  },
}))

function renderShelf(props: Partial<Parameters<typeof DecksScreen>[0]> = {}) {
  return render(
    <ThemeProvider initialContext="light">
      <DecksScreen onBack={jest.fn()} onSelect={jest.fn()} onAddDeck={jest.fn()} {...props} />
    </ThemeProvider>,
  )
}

describe("DecksScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
  })

  it("shows dense rows with format, size, versions, and record", () => {
    const onSelect = jest.fn()
    const view = renderShelf({ onSelect })
    expect(view.getByText("Commander · 100 cards · 3 versions · 75% of 4")).toBeTruthy()
    expect(view.getByText("Recent")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Existing Deck"))
    expect(onSelect).toHaveBeenCalledWith({
      deckId: "existing-deck",
      name: "Existing Deck",
      game: "mtg",
      format: "commander",
      cardQuantity: 100,
    })
  })

  it("shows the deck shelf structure while decks load", () => {
    mockListMine.value = undefined
    const view = renderShelf()

    expect(view.getByLabelText("Loading decks")).toBeTruthy()
    expect(view.getAllByTestId("deck-skeleton-row")).toHaveLength(4)
    expect(
      StyleSheet.flatten(view.getAllByTestId("deck-skeleton-cover")[0].props.style),
    ).toMatchObject({
      width: 46,
      height: 64,
      backgroundColor: colors.separator,
    })
    expect(view.queryByText("No Magic decks yet")).toBeNull()
  })

  it("opens the add-deck route", () => {
    const onAddDeck = jest.fn()
    const view = renderShelf({ onAddDeck })
    fireEvent.press(view.getByTestId("add-deck-tile"))
    expect(onAddDeck).toHaveBeenCalledTimes(1)
  })

  it("narrows the shelf to a single format", () => {
    const view = renderShelf()
    expect(view.getByText("Mono Red")).toBeTruthy()
    fireEvent.press(view.getByTestId("deck-filter-button"))
    fireEvent.press(view.getByTestId("format-filter-standard"))
    expect(view.getByText("Mono Red")).toBeTruthy()
    expect(view.queryByText("Existing Deck")).toBeNull()
  })

  it("narrows the shelf by search and offers a way back", () => {
    const view = renderShelf()
    fireEvent.changeText(view.getByTestId("deck-search-input"), "mono")
    expect(view.queryByText("Existing Deck")).toBeNull()
    fireEvent.changeText(view.getByTestId("deck-search-input"), "nothing here")
    expect(view.getByText("Nothing matches those filters")).toBeTruthy()
    fireEvent.press(view.getByText("Clear filters"))
    expect(view.getByText("Existing Deck")).toBeTruthy()
  })

  it("keeps only games that are actually supported selectable", () => {
    const view = renderShelf()
    fireEvent.press(view.getByTestId("deck-filter-button"))
    expect(view.getByTestId("game-filter-ygo")).toBeDisabled()
  })

  it("hints when the chosen game has no decks yet", () => {
    mockListMine.value = {
      decks: [],
      capacity: { used: 0, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.getByTestId("add-deck-tile")).toBeTruthy()
    expect(view.getByText("No Magic decks yet")).toBeTruthy()
  })

  it("does not put upgrade copy on the deck shelf", () => {
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { used: 1, limit: 1, premium: false, canCreate: false },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.queryByText(/Premium/)).toBeNull()
    expect(view.getByTestId("add-deck-tile")).toBeEnabled()
  })
})
