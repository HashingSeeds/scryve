import { StyleSheet } from "react-native"
import { act, fireEvent, render, within } from "@testing-library/react-native"

import * as deckSync from "@/features/decks/decksSync"
import * as deckWrites from "@/features/decks/decksSyncWrites"
import { clearGuestDecks, guestDeckRouteId, saveGuestDeck } from "@/features/decks/guestDeck"
import { recordRecentDeck } from "@/features/decks/recentDecks"
import { colors } from "@/theme/colors"
import { colors as darkColors } from "@/theme/colorsDark"
import { ThemeProvider } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import { accessibleForeground } from "@/utils/colorContrast"
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
    keyRecord?: { games: number; wins: number; losses: number; draws: number; unknown: number }
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
const mockTotalsQuery = jest.fn()

const mockListMine: { value: ShelfState | undefined; error?: Error } = {
  value: {
    decks: [commanderDeck, standardDeck],
    capacity: { used: 2, limit: 100, premium: true, canCreate: true },
    analyticsLocked: false,
  },
}

let mockTotals:
  | {
      deckKey: string
      games: number
      wins: number
      losses: number
      draws: number
      unknown: number
      manualMatches?: {
        total: number
        wins: number
        losses: number
        draws: number
        unknown: number
      }
    }[]
  | Error
  | undefined = []
jest.mock("convex/react", () => ({
  useConvex: () => mockConvexClient,
  useQuery: (reference: unknown, args?: unknown) => {
    if (args === "skip") return undefined
    if (mockListMine.error) throw mockListMine.error
    if (reference === "decks.capacity") return mockListMine.value?.capacity
    if (reference === "deckStats.totalsByKey") {
      mockTotalsQuery()
      if (mockTotals instanceof Error) throw mockTotals
      return mockTotals
    }
    return mockListMine.value
  },
  useMutation: () => mockSetFavorite,
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    deckStats: { totalsByKey: "deckStats.totalsByKey" },
    decks: {
      capacity: "decks.capacity",
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
        onHistory={jest.fn()}
        onSettings={jest.fn()}
        onSupport={jest.fn()}
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
      remove: jest.fn(),
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

  it("hides a deck deleted offline before the delete syncs", () => {
    jest.spyOn(deckSync, "isDeckSyncEnabled").mockReturnValue(true)
    jest.spyOn(deckSync, "useDeckSync").mockReturnValue({
      decks: [commanderDeck, standardDeck],
      metadata: [],
      loading: false,
      retry: jest.fn(),
    })
    jest.spyOn(deckWrites, "useDeckMetadataWrites").mockReturnValue({
      metadata: [
        {
          id: standardDeck._id,
          deckId: standardDeck._id as Id<"decks">,
          name: standardDeck.name,
          format: standardDeck.format,
          game: "mtg",
          note: "",
          revision: 2,
          deleted: true,
          createdAt: 1,
          updatedAt: 200,
        },
      ],
      pending: [],
      capacityBlocked: false,
      failures: [],
      update: jest.fn(),
      discardFailure: jest.fn(),
      reapplyFailure: jest.fn(),
      remove: jest.fn(),
    })
    const view = renderShelf()
    expect(view.getByText(commanderDeck.name)).toBeTruthy()
    expect(view.queryByText(standardDeck.name)).toBeNull()
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

  it("lists account and device decks together, newest first, each marked with where it lives", () => {
    const local = saveGuestDeck({ name: "Local deck", format: "commander", game: "mtg", cards: [] })
    const view = renderShelf()
    const list = within(view.getByTestId("decks-list"))
    expect(list.queryByText("Synced")).toBeNull()
    expect(list.queryByText("On this device")).toBeNull()
    const localCard = within(view.getByTestId(`deck-card-${guestDeckRouteId(local.localId)}`))
    expect(localCard.getByTestId("deck-home-device")).toBeTruthy()
    expect(localCard.queryByTestId("deck-home-account")).toBeNull()
    const accountCard = within(view.getByTestId("deck-card-existing-deck"))
    expect(accountCard.getByTestId("deck-home-account")).toBeTruthy()
    expect(accountCard.queryByTestId("deck-home-device")).toBeNull()
    const names = list.getAllByRole("button").map((button) => button.props.accessibilityLabel)
    expect(names.indexOf("Local deck, on this device")).toBeLessThan(names.indexOf("Existing Deck"))
  })

  it("shows a local deck's record from its key totals only while its account is signed in", () => {
    const local = saveGuestDeck(
      { name: "Local record", format: "commander", game: "mtg", cards: [] },
      { deckKey: "local-key" },
    )
    mockTotals = [{ deckKey: "local-key", games: 4, wins: 3, losses: 1, draws: 0, unknown: 0 }]
    const access = {
      ready: true,
      loading: false,
      signedIn: true,
      ownerId: "owner-a",
      request: jest.fn(),
    }
    const view = renderShelf({ access })
    const row = () => within(view.getByTestId(`deck-card-${guestDeckRouteId(local.localId)}`))
    expect(row().getByText("3-1")).toBeTruthy()
    mockTotals = undefined
    view.rerender(shelf({ access: { ...access, ownerId: "owner-b" } }))
    expect(row().queryByText("3-1")).toBeNull()
    mockTotals = [{ deckKey: "local-key", games: 4, wins: 1, losses: 3, draws: 0, unknown: 0 }]
    view.rerender(shelf({ access: { ...access, ownerId: "owner-b" } }))
    expect(row().getByText("1-3")).toBeTruthy()
    expect(row().queryByText("3-1")).toBeNull()
    view.rerender(
      shelf({ access: { ...access, ready: false, signedIn: false, ownerId: undefined } }),
    )
    expect(row().queryByText("3-1")).toBeNull()
    expect(row().queryByText("1-3")).toBeNull()
    mockTotals = []
  })

  it("adds manual results to a deck's row so it matches the deck page", () => {
    const local = saveGuestDeck(
      { name: "Local record", format: "commander", game: "mtg", cards: [] },
      { deckKey: "local-key" },
    )
    mockTotals = [
      {
        deckKey: "local-key",
        games: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        unknown: 0,
        manualMatches: { total: 2, wins: 1, losses: 1, draws: 0, unknown: 0 },
      },
    ]
    const view = renderShelf({
      access: {
        ready: true,
        loading: false,
        signedIn: true,
        ownerId: "owner-a",
        request: jest.fn(),
      },
    })
    expect(
      within(view.getByTestId(`deck-card-${guestDeckRouteId(local.localId)}`)).getByText("2-1"),
    ).toBeTruthy()
    mockTotals = []
  })

  it("only queries key totals while device-only decks exist", () => {
    const access = {
      ready: true,
      loading: false,
      signedIn: true,
      ownerId: "owner-a",
      request: jest.fn(),
    }
    renderShelf({ access })
    expect(mockTotalsQuery).not.toHaveBeenCalled()
    act(() => {
      saveGuestDeck({ name: "Local", format: "commander", game: "mtg", cards: [] })
    })
    expect(mockTotalsQuery).toHaveBeenCalled()
    mockTotalsQuery.mockClear()
    act(() => clearGuestDecks())
    expect(mockTotalsQuery).not.toHaveBeenCalled()
  })

  it("still lists local decks when their key totals fail to load", () => {
    saveGuestDeck(
      { name: "Local despite totals", format: "commander", game: "mtg", cards: [] },
      { deckKey: "local-key" },
    )
    mockTotals = new Error("totals unavailable")
    const list = within(renderShelf().getByTestId("decks-list"))
    expect(list.getByText("Local despite totals")).toBeTruthy()
    mockTotals = []
  })

  it("leaves out the empty hint when only local decks exist", () => {
    saveGuestDeck({ name: "Local only", format: "commander", game: "mtg", cards: [] })
    mockListMine.value = {
      decks: [],
      capacity: { used: 0, limit: 2, premium: false, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf()
    const list = within(view.getByTestId("decks-list"))
    expect(list.getByText("Local only")).toBeTruthy()
    expect(list.queryByText("Synced")).toBeNull()
    expect(view.queryByText("No decks yet")).toBeNull()
    expect(view.queryByText("Add a deck to get started.")).toBeNull()
  })

  it("opens each local deck while auth is loading without querying the private shelf", () => {
    saveGuestDeck({ name: "Guest Commander", format: "commander", game: "mtg", cards: [] })
    const second = saveGuestDeck({ name: "Guest Modern", format: "modern", game: "mtg", cards: [] })
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
    fireEvent.press(view.getByLabelText("Guest Modern, on this device"))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: guestDeckRouteId(second.localId), name: "Guest Modern" }),
    )
    fireEvent.changeText(view.getByTestId("deck-search-input"), "modern")
    expect(view.queryByText("Guest Commander")).toBeNull()
    expect(view.getByText("Guest Modern")).toBeTruthy()
    expect(view.getByLabelText("Guest Modern, on this device")).toBeTruthy()
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
      remove: jest.fn(),
    })
    clear()
    clearGuestDecks()
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    mockListMine.error = undefined
    mockTotals = []
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

  it("renders mixed-system decks as quiet ledger rows instead of card artwork", () => {
    const onSelect = jest.fn()
    mockListMine.value = {
      decks: [
        {
          ...commanderDeck,
          coverImageUrl: "https://cards.scryfall.io/small/example.jpg",
          keyRecord: { games: 5, wins: 3, losses: 2, draws: 0, unknown: 0 },
        },
        pokemonDeck,
      ],
      capacity: { used: 2, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf({ onSelect })
    expect(view.getByText("Magic · Commander · 100 cards")).toBeTruthy()
    expect(view.getByText("3 versions")).toBeTruthy()
    expect(view.getByText("3-2")).toBeTruthy()
    expect(view.getByText("Pokémon · Standard · 60 cards")).toBeTruthy()
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
      remove: jest.fn(),
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

    writes.failures = []
    view.rerender(shelf({ onSelect }))
    expect(
      view.queryByTestId("deck-needs-review-standard-deck", { includeHiddenElements: true }),
    ).toBeNull()
    expect(view.getByLabelText("Mono Red")).toBeTruthy()
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
    expect(StyleSheet.flatten(within(activeFilter).getByText("Magic  ✕").props.style).color).toBe(
      accessibleForeground(themeColors.tint),
    )
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

  it("keeps search visible and reveals formats after choosing a system", () => {
    const view = renderShelf()
    expect(view.getByTestId("deck-search-input")).toBeTruthy()
    expect(view.queryByTestId("format-filter")).toBeNull()

    fireEvent.press(view.getByTestId("deck-filters-button"))
    expect(view.getByTestId("deck-filters-dialog")).toBeTruthy()
    expect(view.getByTestId("system-filter")).toBeTruthy()
    expect(view.queryByTestId("format-filter")).toBeNull()
    expect(view.getByText("Choose a system to filter by format.")).toBeTruthy()

    fireEvent.press(view.getByTestId("system-filter-mtg"))
    expect(view.queryByText("Choose a system to filter by format.")).toBeNull()
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

    expect(view.getByLabelText("Filters (2)")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Remove filter Standard"))
    expect(view.getByLabelText("Filters (1)")).toBeTruthy()
    expect(view.queryByLabelText("Remove filter Standard")).toBeNull()
    fireEvent.press(view.getByLabelText("Remove filter Magic"))
    expect(view.getByLabelText("Filters")).toBeTruthy()
    expect(view.queryByLabelText("Remove filter Magic")).toBeNull()
  })

  it("reserves the same dialog height when systems reveal different formats", () => {
    const view = renderShelf()
    fireEvent.press(view.getByTestId("deck-filters-button"))

    for (const system of ["all", "mtg", "ygo", "pokemon", "all"]) {
      fireEvent.press(view.getByTestId(`system-filter-${system}`))
      expect(StyleSheet.flatten(view.getByTestId("deck-filters-dialog").props.style)).toMatchObject(
        {
          height: 480,
          maxHeight: "100%",
        },
      )
      expect(view.getByTestId("deck-filters-done")).toBeEnabled()
    }
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

  it("hints when there are no decks yet and opens the add-deck route", () => {
    mockListMine.value = {
      decks: [],
      capacity: { used: 0, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const onAddDeck = jest.fn()
    const view = renderShelf({ onAddDeck })
    expect(view.getByText("No decks yet")).toBeTruthy()
    fireEvent.press(view.getByText("Add deck"))
    expect(onAddDeck).toHaveBeenCalledTimes(1)
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

  it("gives each collection its own empty state when device decks sit outside it", () => {
    const local = saveGuestDeck({ name: "Local", format: "commander", game: "mtg", cards: [] })
    mockListMine.value = {
      decks: [standardDeck],
      capacity: { used: 1, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    const view = renderShelf()

    fireEvent.press(view.getByTestId("collection-filter-favorites"))
    expect(view.getByText("No favorite decks yet")).toBeTruthy()
    expect(view.queryByText("Nothing matches")).toBeNull()
    expect(view.queryByText("Clear search and filters")).toBeNull()

    fireEvent.press(view.getByTestId("collection-filter-recent"))
    expect(view.getByText("No recent decks yet")).toBeTruthy()
    expect(view.queryByText("Clear search and filters")).toBeNull()

    act(() => recordRecentDeck(guestDeckRouteId(local.localId)))
    expect(view.getByText("Local")).toBeTruthy()
    expect(view.queryByText("No recent decks yet")).toBeNull()

    fireEvent.changeText(view.getByTestId("deck-search-input"), "nothing here")
    expect(view.getByText("Nothing matches")).toBeTruthy()
    fireEvent.press(view.getByText("Clear search and filters"))
    expect(view.getByText("Local")).toBeTruthy()
  })

  it("gives each collection its own empty state for signed-out device decks", () => {
    saveGuestDeck({ name: "Local", format: "commander", game: "mtg", cards: [] })
    const view = renderShelf({
      access: { ready: false, loading: false, signedIn: false, request: jest.fn() },
    })

    fireEvent.press(view.getByTestId("collection-filter-favorites"))
    expect(view.getByText("No favorite decks yet")).toBeTruthy()
    expect(view.queryByText("Clear search and filters")).toBeNull()

    fireEvent.press(view.getByTestId("collection-filter-all"))
    fireEvent.changeText(view.getByTestId("deck-search-input"), "nothing here")
    expect(view.getByText("Nothing matches")).toBeTruthy()
    fireEvent.press(view.getByText("Clear search and filters"))
    expect(view.getByText("Local")).toBeTruthy()
  })

  it("keeps Add deck enabled on a full free shelf", () => {
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { used: 2, limit: 2, premium: false, canCreate: false },
      analyticsLocked: false,
    }
    const view = renderShelf()
    expect(view.getByText("Add deck")).toBeEnabled()
  })

  it.each([
    [{ used: 2, limit: 2, premium: false }, "2 of 2 free synced decks"],
    [{ used: 2, limit: 100, premium: true }, undefined],
    [{ used: 90, limit: 100, premium: true }, "90 of 100 synced decks"],
  ])("shows the deck count beside the title for %j", (capacity, label) => {
    mockListMine.value = {
      decks: [commanderDeck, standardDeck],
      capacity: { ...capacity, canCreate: capacity.used < capacity.limit },
      analyticsLocked: false,
    }
    const view = renderShelf()
    if (label) expect(view.getByLabelText(label)).toBeTruthy()
    else expect(view.queryByTestId("deck-count")).toBeNull()
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
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
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
  test("offers Sync for decks only on this device above the one list", () => {
    for (let index = 0; index < 3; index++)
      saveGuestDeck({ name: `Local ${index}`, format: "commander", game: "mtg", cards: [] })
    const view = renderShelf({
      access: { ready: true, loading: false, signedIn: true, ownerId: "owner", request: jest.fn() },
    })
    const header = within(view.getByTestId("local-deck-sync-header"))
    expect(header.getByText("On this device")).toBeTruthy()
    expect(header.getByTestId("local-deck-sync-choose")).toBeTruthy()
  })
})
