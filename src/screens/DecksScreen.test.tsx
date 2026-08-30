import { StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { recordRecentDeck } from "@/features/decks/recentDecks"
import { colors } from "@/theme/colors"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

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
    favoritedAt?: number
    lastPlayedAt?: number
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

const pokemonDeck = {
  _id: "pokemon-deck",
  name: "Lucario Hariyama",
  format: "standard",
  game: "pokemon",
  versionCount: 1,
  cardQuantity: 60,
  coverImageUrl: undefined,
}

const mockSetFavorite = jest.fn(async () => null)

const mockListMine: { value: ShelfState | undefined; error?: Error } = {
  value: {
    decks: [commanderDeck, standardDeck],
    capacity: { used: 2, limit: 100, premium: true, canCreate: true },
    analyticsLocked: false,
  },
}

jest.mock("convex/react", () => ({
  useQuery: () => {
    if (mockListMine.error) throw mockListMine.error
    return mockListMine.value
  },
  useMutation: () => mockSetFavorite,
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    decks: {
      listMine: "decks.listMine",
      setFavorite: "decks.setFavorite",
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
    clear()
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    mockListMine.error = undefined
  })

  it("shows dense rows with format, size, versions, and record", () => {
    const onSelect = jest.fn()
    const view = renderShelf({ onSelect })
    expect(view.getByText("Magic · Commander · 100 cards · 3 versions · 75% of 4")).toBeTruthy()
    expect(view.getAllByText("Recent")).toHaveLength(1)
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
    expect(view.queryByText("No decks yet")).toBeNull()
  })

  it("opens the add-deck route", () => {
    const onAddDeck = jest.fn()
    const view = renderShelf({ onAddDeck })
    fireEvent.press(view.getByTestId("add-deck-tile"))
    expect(onAddDeck).toHaveBeenCalledTimes(1)
  })

  it("keeps search visible and reveals formats after choosing a system", () => {
    const view = renderShelf()
    expect(view.getByTestId("deck-search-input")).toBeTruthy()
    expect(view.queryByTestId("format-filter")).toBeNull()

    fireEvent.press(view.getByTestId("deck-filters-button"))
    expect(view.getByTestId("deck-filters-dialog")).toBeTruthy()
    expect(view.getByTestId("system-filter")).toBeTruthy()
    expect(view.queryByTestId("format-filter")).toBeNull()

    fireEvent.press(view.getByTestId("system-filter-mtg"))
    expect(view.getByTestId("format-filter")).toBeTruthy()
    expect(view.getByTestId("format-filter-all").props.accessibilityState.selected).toBe(true)

    expect(view.getByText("Mono Red")).toBeTruthy()
    fireEvent.press(view.getByTestId("format-filter-standard"))
    expect(view.getByText("Mono Red")).toBeTruthy()
    expect(view.queryByText("Existing Deck")).toBeNull()

    fireEvent.press(view.getByTestId("deck-filters-done"))
    expect(view.queryByTestId("deck-filters-dialog")).toBeNull()
    expect(view.getByLabelText("Remove filter Magic")).toBeTruthy()
    expect(view.getByLabelText("Remove filter Standard")).toBeTruthy()

    fireEvent.press(view.getByTestId("collection-filter-favorites"))
    expect(view.getByLabelText("Remove filter Magic")).toBeTruthy()
    expect(view.getByLabelText("Remove filter Standard")).toBeTruthy()
  })

  it("narrows the shelf by search and offers a way back", () => {
    const view = renderShelf()
    fireEvent.changeText(view.getByTestId("deck-search-input"), "mono")
    expect(view.queryByText("Existing Deck")).toBeNull()
    fireEvent.changeText(view.getByTestId("deck-search-input"), "nothing here")
    expect(view.getByText("Nothing matches")).toBeTruthy()
    fireEvent.press(view.getByText("Clear search and filters"))
    expect(view.getByText("Existing Deck")).toBeTruthy()
  })

  it("keeps all released systems selectable", () => {
    const view = renderShelf()
    fireEvent.press(view.getByTestId("deck-filters-button"))
    expect(view.getByTestId("system-filter-ygo")).toBeEnabled()
    expect(view.getByTestId("system-filter-pokemon")).toBeEnabled()
  })

  it("hints when there are no decks yet", () => {
    mockListMine.value = {
      decks: [],
      capacity: { used: 0, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.getByTestId("add-deck-tile")).toBeTruthy()
    expect(view.getByText("No decks yet")).toBeTruthy()
  })

  it("shows the system on rows while browsing mixed decks", () => {
    mockListMine.value = {
      decks: [commanderDeck, pokemonDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.getByText("Magic · Commander · 100 cards · 3 versions · 75% of 4")).toBeTruthy()
    expect(view.getByText("Pokémon · Standard · 60 cards")).toBeTruthy()
  })

  it("shows synced favorites and toggles them without opening the deck", () => {
    const onSelect = jest.fn()
    mockListMine.value = {
      decks: [{ ...commanderDeck, favoritedAt: 200 }, standardDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf({ onSelect })

    fireEvent.press(view.getByTestId("collection-filter-favorites"))
    expect(view.getByText("Existing Deck")).toBeTruthy()
    expect(view.queryByText("Mono Red")).toBeNull()

    fireEvent.press(view.getByTestId("favorite-deck-existing-deck"))
    expect(mockSetFavorite).toHaveBeenCalledWith({ deckId: "existing-deck", favorite: false })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("updates an already-mounted shelf when a deck is opened elsewhere", () => {
    const view = renderShelf()
    fireEvent.press(view.getByTestId("collection-filter-recent"))
    expect(view.getByText("No recent decks yet")).toBeTruthy()

    act(() => recordRecentDeck("existing-deck"))

    expect(view.getByText("Existing Deck")).toBeTruthy()
    expect(view.queryByText("Mono Red")).toBeNull()
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

  it("keeps shelf controls mounted and retries a failed deck query", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockListMine.error = new Error("Network unavailable")
    const view = renderShelf()

    expect(view.getByText("Decks")).toBeTruthy()
    expect(view.getByTestId("collection-filter")).toBeTruthy()
    expect(view.getByTestId("deck-filters-button")).toBeTruthy()
    expect(view.getByTestId("deck-search-input")).toBeTruthy()
    expect(view.getByText("Decks unavailable")).toBeTruthy()

    mockListMine.error = undefined
    fireEvent.press(view.getByTestId("retry-decks"))
    expect(view.getByText("Existing Deck")).toBeTruthy()
    expect(view.queryByTestId("decks-unavailable")).toBeNull()
    consoleError.mockRestore()
  })
})
