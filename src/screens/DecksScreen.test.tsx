import { Image, StyleSheet } from "react-native"
import { act, fireEvent, render, within } from "@testing-library/react-native"

import * as deckSync from "@/features/decks/decksSync"
import * as deckWrites from "@/features/decks/decksSyncWrites"
import { deleteGuestDeck, saveGuestDeck } from "@/features/decks/guestDeck"
import { recordRecentDeck } from "@/features/decks/recentDecks"
import { colors } from "@/theme/colors"
import { colors as darkColors } from "@/theme/colorsDark"
import { ThemeProvider } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import { accessibleForeground, contrastRatio } from "@/utils/colorContrast"
import { clear, loadString } from "@/utils/storage"

import { DecksScreen } from "./DecksScreen"
import type { Id } from "../../convex/_generated/dataModel"

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
  _id: "existing-deck" as Id<"decks">,
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
  _id: "standard-deck" as Id<"decks">,
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

const mockConvexClient = {}

const mockSetFavorite = jest.fn(async () => null)

const mockListMine: { value: ShelfState | undefined; error?: Error } = {
  value: {
    decks: [commanderDeck, standardDeck],
    capacity: { used: 2, limit: 100, premium: true, canCreate: true },
    analyticsLocked: false,
  },
}

jest.mock("convex/react", () => ({
  useConvex: () => mockConvexClient,
  useQuery: (_reference: unknown, args?: unknown) => {
    if (args === "skip") return undefined
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

function shelf(
  props: Partial<Parameters<typeof DecksScreen>[0]> = {},
  theme: "light" | "dark" = "light",
) {
  return (
    <ThemeProvider initialContext={theme}>
      <DecksScreen
        onPlay={jest.fn()}
        onSelect={jest.fn()}
        onAddDeck={jest.fn()}
        onSettings={jest.fn()}
        onAccount={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  )
}

function renderShelf(props: Partial<Parameters<typeof DecksScreen>[0]> = {}) {
  return render(shelf(props))
}

describe("DecksScreen", () => {
  afterEach(() => jest.restoreAllMocks())

  it("shows pending shelf metadata and opens a saved edit when sync is paused", () => {
    jest.spyOn(deckSync, "isDeckSyncEnabled").mockReturnValue(true)
    jest.spyOn(deckSync, "useDeckSync").mockReturnValue({
      decks: [commanderDeck, standardDeck],
      metadata: [],
      loading: false,
      retry: jest.fn(),
    })
    const local = {
      id: standardDeck._id,
      deckId: standardDeck._id as Id<"decks">,
      name: "Local name",
      format: "modern",
      game: "mtg",
      note: "Saved note",
      revision: 1,
      deleted: false,
      createdAt: 1,
      updatedAt: 200,
    }
    jest.spyOn(deckWrites, "useDeckMetadataWrites").mockReturnValue({
      metadata: [local],
      pending: [],
      capacityBlocked: true,
      failures: [
        {
          schemaVersion: 1,
          reason: "Conflict",
          failedAt: 2,
          action: {
            ...local,
            deleted: false,
            schemaVersion: 1,
            ownerId: "owner-a",
            operationId: "failed",
            expectedRevision: 0,
            queuedAt: 1,
            attempts: 1,
          },
        },
      ],
      update: jest.fn(),
      discardFailure: jest.fn(),
      reapplyFailure: jest.fn(),
    })
    const onSelect = jest.fn()
    const view = renderShelf({ onSelect })
    expect(view.getByText("Local name")).toBeTruthy()
    expect(view.queryByText("Mono Red")).toBeNull()
    fireEvent.press(view.getByLabelText("Local name. Needs review"))
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Local name", format: "modern" }),
    )
    expect(view.getByText("Sync paused. Resolve a saved local edit to continue.")).toBeTruthy()
    fireEvent.press(view.getByText("Review saved edit"))
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ deckId: standardDeck._id, reviewChanges: true }),
    )
  })

  it("offers retry instead of an empty shelf when sync has no cached data", () => {
    jest.spyOn(deckSync, "isDeckSyncEnabled").mockReturnValue(true)
    const retry = jest.fn()
    jest.spyOn(deckSync, "useDeckSync").mockReturnValue({
      decks: [],
      metadata: [],
      loading: false,
      unavailable: true,
      retry,
    })
    mockListMine.error = new Error("Private query must be skipped while offline")
    const view = renderShelf({
      access: {
        ready: false,
        loading: false,
        signedIn: true,
        ownerId: "owner-a",
        request: jest.fn(),
      },
    })
    expect(view.getByText("Reconnect to load your decks.")).toBeTruthy()
    expect(view.queryByText("No decks yet")).toBeNull()
    fireEvent.press(view.getByText("Try again"))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("opens the local deck while auth is loading without querying the private shelf", () => {
    saveGuestDeck({ name: "Guest Commander", format: "commander", game: "mtg", cards: [] })
    mockListMine.error = new Error("Private query must not run")
    const onSelect = jest.fn()
    const view = renderShelf({
      onSelect,
      access: {
        ready: false,
        loading: true,
        signedIn: false,
        request: jest.fn(),
      },
    })
    expect(view.getByText("Guest Commander")).toBeTruthy()
    expect(view.queryByText("Existing Deck")).toBeNull()
    fireEvent.press(view.getByLabelText("Guest Commander"))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ deckId: "guest" }))
    fireEvent.changeText(view.getByTestId("deck-search-input"), "no match")
    expect(view.queryByText("Guest Commander")).toBeNull()
    expect(view.queryByText("Nothing matches")).toBeNull()
  })
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(deckSync, "isDeckSyncEnabled").mockReturnValue(false)
    jest.spyOn(deckWrites, "useDeckMetadataWrites").mockReturnValue({
      metadata: [],
      pending: [],
      failures: [],
      capacityBlocked: false,
      update: jest.fn(),
      discardFailure: jest.fn(),
      reapplyFailure: jest.fn(),
    })
    clear()
    deleteGuestDeck()
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    mockListMine.error = undefined
  })

  it("puts app navigation at the bottom and returns to the active game", () => {
    const onPlay = jest.fn()
    const view = renderShelf({ hasCurrentGame: true, onPlay })

    expect(view.getByText("Return to game")).toBeTruthy()
    expect(view.getByTestId("utility-menu-button")).toBeTruthy()
    expect(StyleSheet.flatten(view.getByTestId("floating-app-navigation").props.style).bottom).toBe(
      spacing.md,
    )
    fireEvent.press(view.getByLabelText("Return to game"))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it("renders decks as quiet ledger rows instead of card artwork", () => {
    const onSelect = jest.fn()
    mockListMine.value = {
      decks: [
        {
          ...commanderDeck,
          coverImageUrl: "https://cards.scryfall.io/small/example.jpg",
        },
      ],
      capacity: { used: 1, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf({ onSelect })
    expect(view.getByText("Magic · Commander · 100 cards")).toBeTruthy()
    expect(view.getByText("3 versions")).toBeTruthy()
    expect(view.getByText("75% of 4")).toBeTruthy()
    expect(
      StyleSheet.flatten(view.getByTestId("deck-card-existing-deck").props.style),
    ).toMatchObject({
      minHeight: 72,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    })
    expect(
      StyleSheet.flatten(view.getByTestId("deck-system-marker-existing-deck").props.style),
    ).toMatchObject({
      width: 6,
      height: 34,
      backgroundColor: colors.gameMenu.actions.history,
    })
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

  it("marks only decks with saved edits that need review until they are resolved", () => {
    jest.spyOn(deckSync, "isDeckSyncEnabled").mockReturnValue(true)
    jest.spyOn(deckSync, "useDeckSync").mockReturnValue({
      decks: [commanderDeck, standardDeck],
      metadata: [],
      loading: false,
      retry: jest.fn(),
    })
    const writes = {
      metadata: [],
      pending: [],
      capacityBlocked: false,
      failures: [
        {
          schemaVersion: 1 as const,
          reason: "Conflict",
          failedAt: 2,
          action: {
            schemaVersion: 1 as const,
            ownerId: "owner-a",
            operationId: "failed",
            id: standardDeck._id,
            deckId: standardDeck._id,
            expectedRevision: 0,
            name: standardDeck.name,
            format: standardDeck.format,
            game: standardDeck.game,
            note: "",
            deleted: false,
            createdAt: 1,
            updatedAt: 2,
            queuedAt: 1,
            attempts: 1,
          },
        },
      ],
      update: jest.fn(),
      discardFailure: jest.fn(),
      reapplyFailure: jest.fn(),
    }
    jest.spyOn(deckWrites, "useDeckMetadataWrites").mockImplementation(() => writes)
    const onSelect = jest.fn()
    const view = renderShelf({ onSelect })

    expect(
      view.getByTestId("deck-needs-review-standard-deck", { includeHiddenElements: true }),
    ).toBeTruthy()
    expect(view.queryByTestId("deck-needs-review-existing-deck")).toBeNull()
    fireEvent.press(view.getByLabelText("Mono Red. Needs review"))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ deckId: standardDeck._id }))

    onSelect.mockClear()
    fireEvent.press(view.getByRole("button", { name: "Review deck changes: Mono Red" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: standardDeck._id, reviewChanges: true }),
    )

    view.rerender(shelf({ onSelect }, "dark"))
    const indicator = view.getByTestId("deck-needs-review-standard-deck")
    expect(StyleSheet.flatten(within(indicator).getByText("!").props.style).color).toBe(
      darkColors.error,
    )
    expect(contrastRatio(darkColors.error, darkColors.surface)).toBeGreaterThanOrEqual(3)

    writes.failures = []
    view.rerender(shelf({ onSelect }))
    expect(
      view.queryByTestId("deck-needs-review-standard-deck", { includeHiddenElements: true }),
    ).toBeNull()
    expect(view.getByLabelText("Mono Red")).toBeTruthy()
  })

  it("matches the compact source filters used by History", () => {
    const view = renderShelf()

    expect(StyleSheet.flatten(view.getByTestId("collection-filter-all").props.style)).toMatchObject(
      {
        borderRadius: 24,
        backgroundColor: colors.tint,
      },
    )
    expect(
      StyleSheet.flatten(view.getByTestId("collection-filter-favorites").props.style),
    ).toMatchObject({ borderWidth: 1 })
    expect(
      StyleSheet.flatten(view.getByTestId("collection-filter-favorites").props.style)
        .backgroundColor,
    ).toBeUndefined()
  })

  it.each([
    ["light", colors],
    ["dark", darkColors],
  ] as const)("keeps selected shelf controls readable in %s mode", (theme, themeColors) => {
    const view = render(shelf({}, theme))
    expect(StyleSheet.flatten(view.getByText("All").props.style).color).toBe(
      accessibleForeground(themeColors.tint),
    )

    fireEvent.press(view.getByTestId("deck-filters-button"))
    fireEvent.press(view.getByTestId("system-filter-mtg"))
    const done = view.getByTestId("deck-filters-done")
    expect(StyleSheet.flatten(done.props.style).backgroundColor).toBe(themeColors.tint)
    expect(StyleSheet.flatten(within(done).getByText("Show decks").props.style).color).toBe(
      accessibleForeground(themeColors.tint),
    )
    fireEvent.press(done)
    const activeFilter = view.getByLabelText("Remove filter Magic")
    expect(StyleSheet.flatten(within(activeFilter).getByText("Magic").props.style).color).toBe(
      accessibleForeground(themeColors.tint),
    )
    expect(
      StyleSheet.flatten(within(activeFilter).UNSAFE_getByType(Image).props.style).tintColor,
    ).toBe(accessibleForeground(themeColors.tint))
  })

  it("shows the deck shelf structure while decks load", () => {
    mockListMine.value = undefined
    const view = renderShelf()

    expect(view.getByLabelText("Loading decks")).toBeTruthy()
    expect(view.getAllByTestId("deck-skeleton-row")).toHaveLength(4)
    expect(
      StyleSheet.flatten(view.getAllByTestId("deck-skeleton-marker")[0].props.style),
    ).toMatchObject({
      width: 6,
      height: 34,
      backgroundColor: colors.separator,
    })
    expect(view.queryByText("No decks yet")).toBeNull()
  })

  it("opens the add-deck route", () => {
    const onAddDeck = jest.fn()
    const view = renderShelf({ onAddDeck })
    fireEvent.press(view.getByText("Add deck"))
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
    expect(view.getByText("Add deck")).toBeTruthy()
    expect(view.getByText("No decks yet")).toBeTruthy()
  })

  it("shows the system on rows while browsing mixed decks", () => {
    mockListMine.value = {
      decks: [commanderDeck, pokemonDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.getByText("Magic · Commander · 100 cards")).toBeTruthy()
    expect(view.getByText("3 versions")).toBeTruthy()
    expect(view.getByText("75% of 4")).toBeTruthy()
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
      capacity: { used: 2, limit: 2, premium: false, canCreate: false },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.queryByText(/Premium/)).toBeNull()
    expect(view.getByText("Add deck")).toBeEnabled()
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

  it("opens the lobby system and returns to the lobby", () => {
    mockListMine.value = {
      decks: [commanderDeck, pokemonDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const onBack = jest.fn()
    const view = renderShelf({ initialSystem: "mtg", onBack })
    expect(view.getByText("Existing Deck")).toBeTruthy()
    view.rerender(
      <ThemeProvider initialContext="light">
        <DecksScreen
          initialSystem="pokemon"
          onBack={onBack}
          onPlay={jest.fn()}
          onSelect={jest.fn()}
          onAddDeck={jest.fn()}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.queryByText("Existing Deck")).toBeNull()
    expect(view.getByText("Lucario Hariyama")).toBeTruthy()
    expect(loadString("decks.game")).toBe("pokemon")
    fireEvent.press(view.getAllByText("Back to lobby")[0])
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
