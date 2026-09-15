import { StyleSheet } from "react-native"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native"

import { colors } from "@/theme/colors"
import { ThemeProvider } from "@/theme/context"

import { cardDetailsKey, DeckDetailScreen } from "./DeckDetailScreen"

let mockFocused = true
const mockCaptureAnalytics = jest.fn()
jest.mock("@/utils/analytics", () => ({
  captureAnalytics: (...args: unknown[]) => mockCaptureAnalytics(...args),
}))

const mockDeckSyncState = {
  enabled: false,
  metadata: [] as Array<Record<string, unknown>>,
}
const mockUpdateMetadata = jest.fn()
const mockDiscardMetadataFailure = jest.fn()
const mockReapplyMetadataFailure = jest.fn()
const mockMetadataWriteState = {
  metadata: [] as Array<Record<string, unknown>>,
  pending: [] as Array<Record<string, unknown>>,
  failures: [] as Array<Record<string, unknown>>,
  capacityBlocked: false,
}
jest.mock("@/features/decks/decksSync", () => ({
  isDeckSyncEnabled: () => mockDeckSyncState.enabled,
  useDeckSync: () => ({
    decks: [],
    metadata: mockDeckSyncState.metadata,
    loading: false,
    retry: jest.fn(),
  }),
}))
const mockVersionCacheState = {
  versions: [] as Array<Record<string, unknown>>,
  version: undefined as Record<string, unknown> | undefined,
  cards: undefined as Array<Record<string, unknown>> | undefined,
}
jest.mock("@/features/decks/deckVersionsCache", () => ({
  useDeckVersionCache: () => mockVersionCacheState,
}))
jest.mock("@/features/decks/decksSyncWrites", () => ({
  DECK_CONFLICT_REASON: "Deck changed on another device. Choose which version to keep.",
  useDeckMetadataWrites: () => ({
    ...mockMetadataWriteState,
    update: mockUpdateMetadata,
    discardFailure: mockDiscardMetadataFailure,
    reapplyFailure: mockReapplyMetadataFailure,
  }),
}))
const mockVersionCardUpdate = jest.fn()
const mockVersionCardDiscard = jest.fn()
const mockVersionCardReapply = jest.fn()
const mockVersionCardWriteState = {
  pending: [] as Array<Record<string, unknown>>,
  failures: [] as Array<Record<string, unknown>>,
  capacityBlocked: false,
}
jest.mock("@/features/decks/decksVersionWrites", () => ({
  DECK_VERSION_CONFLICT_REASON:
    "Deck cards changed on another device. Choose which card list to keep.",
  useDeckVersionWrites: () => ({
    ...mockVersionCardWriteState,
    update: mockVersionCardUpdate,
    discardFailure: mockVersionCardDiscard,
    reapplyFailure: mockVersionCardReapply,
  }),
}))

const mockSaveVersion = jest.fn(async () => "version-main")
const mockCreateVersion = jest.fn(async () => "version-new")
const mockUpdateVersion = jest.fn(async () => null)
const mockDeleteVersion = jest.fn(async () => null)
const mockUpdateDeck = jest.fn(async () => null)
const mockArchiveDeck = jest.fn(async () => null)
const mockSearchCards = jest.fn(async () => [])
const mockCardById = jest.fn(async () => ({}))
const mockCatalogCardById = jest.fn(async () => ({
  typeLabel: "Effect Monster",
  text: "When a card or effect is activated that includes an effect that Special Summons a monster: You can discard this card; negate that effect.",
  setCode: "MACR",
  collectorNumber: "036",
  rarity: "secret rare",
}))
const mockPokemonCardByReference = jest.fn(async () => ({
  typeLabel: "Pokemon · Basic · Fighting",
  text: "Punch · 20",
  setCode: "me01",
  collectorNumber: "76",
  rarity: "common",
}))
const queryArgs: Array<Record<string, unknown>> = []
let mockPreventRemoveCallback: ((options: { data: { action: object } }) => void) | undefined
const mockNavigationDispatch = jest.fn()

const solRing = {
  _id: "card-1",
  _creationTime: 0,
  deckVersionId: "version-main",
  oracleId: "11111111-1111-1111-1111-111111111111",
  scryfallId: "22222222-2222-2222-2222-222222222222",
  name: "Sol Ring",
  imageUrl: "https://cards.scryfall.io/normal/sol-ring.jpg",
  quantity: 1,
  board: "main" as const,
}

const mainVersion = {
  _id: "version-main",
  versionNumber: 1,
  name: "Main",
  note: "The list I actually sleeve",
  cardCount: 1,
  cardQuantity: 1,
  createdAt: 0,
  updatedAt: 0,
  record: { games: 4, wins: 3, losses: 1, draws: 0, unknown: 0 },
}

const sideboardVersion = {
  _id: "version-sideboard",
  versionNumber: 2,
  name: "vs Control",
  note: undefined,
  cardCount: 1,
  cardQuantity: 1,
  createdAt: 0,
  updatedAt: 0,
  record: { games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 },
}

const loadedDetail = {
  deck: {
    _id: "deck-1",
    name: "Existing Deck",
    format: "commander",
    game: "mtg",
    note: "Ramp into big spells",
  },
  versions: [mainVersion, sideboardVersion],
  version: mainVersion,
  cards: [solRing],
  capacity: { used: 2, limit: 5, premium: true, canCreate: true },
  record: { games: 6, wins: 3, losses: 3, draws: 0, unknown: 0 },
  analyticsLocked: false,
}

const cachedMetadata = {
  id: "metadata-1",
  deckId: "deck-1",
  revision: 4,
  name: "Existing Deck",
  format: "commander",
  game: "mtg",
  note: "Ramp into big spells",
  deleted: false,
  createdAt: 0,
  updatedAt: 1,
}

const mockDetail = {
  value: loadedDetail as Record<string, unknown> | undefined,
  error: undefined as Error | undefined,
}

jest.mock("convex/react", () => ({
  useConvex: () => undefined,
  useQuery: (_reference: string, args: Record<string, unknown> | "skip") => {
    if (args === "skip") return undefined
    queryArgs.push(args)
    if (mockDetail.error) throw mockDetail.error
    return mockDetail.value
  },
  useMutation: (reference: string) => {
    if (reference === "decks.saveVersion") return mockSaveVersion
    if (reference === "decks.createVersion") return mockCreateVersion
    if (reference === "decks.updateVersion") return mockUpdateVersion
    if (reference === "decks.deleteVersion") return mockDeleteVersion
    if (reference === "decks.update") return mockUpdateDeck
    return mockArchiveDeck
  },
  useAction: (reference: string) => {
    if (reference === "cards.search") return mockSearchCards
    if (reference === "cards.byCatalogId") return mockCatalogCardById
    if (reference === "cards.byPokemonReference") return mockPokemonCardByReference
    return mockCardById
  },
}))

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) =>
    require("react").useEffect(() => {
      if (mockFocused) return callback()
    }, [callback, mockFocused]),
  useNavigation: () => ({
    dispatch: mockNavigationDispatch,
  }),
}))

jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (
    _preventRemove: boolean,
    callback: (options: { data: { action: object } }) => void,
  ) => {
    mockPreventRemoveCallback = callback
  },
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    decks: {
      detail: "decks.detail",
      saveVersion: "decks.saveVersion",
      createVersion: "decks.createVersion",
      updateVersion: "decks.updateVersion",
      deleteVersion: "decks.deleteVersion",
      update: "decks.update",
      archive: "decks.archive",
    },
    cards: {
      search: "cards.search",
      byId: "cards.byId",
      byCatalogId: "cards.byCatalogId",
      byPokemonReference: "cards.byPokemonReference",
    },
  },
}))

function renderDetail(access?: Parameters<typeof DeckDetailScreen>[0]["access"]) {
  return render(
    <ThemeProvider initialContext="light">
      <DeckDetailScreen deckId="deck-1" onBack={jest.fn()} access={access} />
    </ThemeProvider>,
  )
}

describe("DeckDetailScreen", () => {
  beforeEach(() => {
    mockFocused = true
    jest.clearAllMocks()
    queryArgs.length = 0
    mockPreventRemoveCallback = undefined
    mockNavigationDispatch.mockClear()
    mockDetail.value = {
      ...loadedDetail,
      version: mainVersion,
      capacity: { used: 2, limit: 5, premium: true, canCreate: true },
    }
    mockDetail.error = undefined
    mockDeckSyncState.enabled = false
    mockDeckSyncState.metadata = []
    mockVersionCacheState.versions = []
    mockVersionCacheState.version = undefined
    mockVersionCacheState.cards = undefined
    mockMetadataWriteState.metadata = []
    mockMetadataWriteState.pending = []
    mockMetadataWriteState.failures = []
    mockMetadataWriteState.capacityBlocked = false
    mockVersionCardWriteState.pending = []
    mockVersionCardWriteState.failures = []
    mockVersionCardWriteState.capacityBlocked = false
    mockVersionCardUpdate.mockClear()
  })

  it("renders cached version contents offline and queues durable card edits on save", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    mockVersionCacheState.version = {
      deckId: "deck-1",
      versionId: "version-main",
      revision: 2,
      versionNumber: 1,
      name: "Main",
      note: "",
      fingerprint: "f1",
      cardCount: 1,
      cardQuantity: 1,
      deleted: false,
      updatedAt: 1,
    }
    mockVersionCacheState.versions = [mockVersionCacheState.version]
    mockVersionCacheState.cards = [solRing]
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Sol Ring")).toBeTruthy()
    expect(view.getByText("1×")).toBeTruthy()
    expect(view.queryByText("Card list unavailable offline.")).toBeNull()
    expect(view.getByTestId("deck-add-cards")).toBeDisabled()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    expect(view.getByLabelText("Increase Sol Ring")).toBeEnabled()
    expect(view.getByLabelText("Remove Sol Ring")).toBeEnabled()
    fireEvent.press(view.getByLabelText("Increase Sol Ring"))
    fireEvent.press(view.getByTestId("save-version-button"))
    expect(mockVersionCardUpdate).toHaveBeenCalledWith(
      "deck-1",
      "version-main",
      [expect.objectContaining({ name: "Sol Ring", quantity: 2 })],
      2,
    )
    expect(mockSaveVersion).not.toHaveBeenCalled()
  })

  it("distinguishes uncached versions from cached empty decks offline", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]

    mockVersionCacheState.version = undefined
    mockVersionCacheState.versions = []
    const uncached = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )
    expect(uncached.getByText("Card list unavailable offline.")).toBeTruthy()
    uncached.unmount()

    mockVersionCacheState.version = {
      deckId: "deck-1",
      versionId: "version-empty",
      revision: 1,
      versionNumber: 2,
      name: "Empty",
      note: "",
      fingerprint: "f2",
      cardCount: 0,
      cardQuantity: 0,
      deleted: false,
      updatedAt: 1,
    }
    mockVersionCacheState.versions = [mockVersionCacheState.version]
    mockVersionCacheState.cards = []
    const empty = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )
    expect(empty.getByText("No cards yet. Add your first card below.")).toBeTruthy()
    expect(empty.queryByText("Card list unavailable offline.")).toBeNull()
  })

  it("switches among previously cached versions while offline", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    const cachedVersions = [
      {
        deckId: "deck-1",
        versionId: "version-main",
        revision: 1,
        versionNumber: 1,
        name: "Main",
        note: "",
        fingerprint: "f1",
        cardCount: 1,
        cardQuantity: 1,
        deleted: false,
        updatedAt: 1,
      },
      {
        deckId: "deck-1",
        versionId: "version-sideboard",
        revision: 1,
        versionNumber: 2,
        name: "vs Control",
        note: "More removal",
        fingerprint: "f2",
        cardCount: 1,
        cardQuantity: 1,
        deleted: false,
        updatedAt: 2,
      },
    ]
    mockVersionCacheState.versions = cachedVersions
    mockVersionCacheState.version = cachedVersions[1]
    mockVersionCacheState.cards = [
      { ...solRing, name: "Counterspell", deckVersionId: "version-sideboard" },
    ]
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Counterspell")).toBeTruthy()
    expect(view.queryByText("Sol Ring")).toBeNull()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    expect(view.getByText("vs Control")).toBeTruthy()
    fireEvent.press(view.getByTestId("version-picker-version-main"))
    mockVersionCacheState.version = cachedVersions[0]
    mockVersionCacheState.cards = [solRing]
    view.rerender(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Sol Ring")).toBeTruthy()
  })

  it("keeps a valid cached-origin edit when live detail arrives without auto-saving", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    mockVersionCacheState.version = {
      deckId: "deck-1",
      versionId: "version-main",
      revision: 1,
      versionNumber: 1,
      name: "Main",
      note: "",
      fingerprint: "f1",
      cardCount: 1,
      cardQuantity: 1,
      deleted: false,
      updatedAt: 1,
    }
    mockVersionCacheState.versions = [mockVersionCacheState.version]
    mockVersionCacheState.cards = [{ ...solRing, name: "Stale Snapshot" }]
    const screen = (ready: boolean) => (
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{ ready, loading: false, signedIn: true, ownerId: "owner-a", request: jest.fn() }}
        />
      </ThemeProvider>
    )
    const view = render(screen(false))
    fireEvent.press(view.getByTestId("edit-deck-button"))
    expect(view.queryByText("Unsaved changes")).toBeNull()

    mockDetail.value = loadedDetail
    view.rerender(screen(true))

    expect(view.getByLabelText("1× Stale Snapshot")).toBeTruthy()
    expect(view.queryByText("Unsaved changes")).toBeNull()
    expect(view.getByTestId("save-version-button")).toBeDisabled()
    expect(mockSaveVersion).not.toHaveBeenCalled()
    expect(mockVersionCardUpdate).not.toHaveBeenCalled()
    expect(view.getByLabelText("Increase Stale Snapshot")).not.toBeDisabled()
    expect(view.getByLabelText("Remove Stale Snapshot")).not.toBeDisabled()
  })

  it("re-seeds an uncached offline edit on reconnect without auto-dirtying or empty-saving", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    mockVersionCacheState.version = undefined
    mockVersionCacheState.versions = []
    mockVersionCacheState.cards = undefined
    const screen = (ready: boolean) => (
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{ ready, loading: false, signedIn: true, ownerId: "owner-a", request: jest.fn() }}
        />
      </ThemeProvider>
    )
    const view = render(screen(false))
    fireEvent.press(view.getByTestId("edit-deck-button"))
    expect(view.queryByText("Unsaved changes")).toBeNull()

    mockDetail.value = loadedDetail
    view.rerender(screen(true))

    expect(view.getByLabelText("1× Sol Ring")).toBeTruthy()
    expect(view.queryByText("Unsaved changes")).toBeNull()
    expect(view.getByTestId("save-version-button")).toBeDisabled()
    expect(mockSaveVersion).not.toHaveBeenCalled()
    expect(view.getByLabelText("Increase Sol Ring")).not.toBeDisabled()
  })

  it("records stats again when the screen regains focus", () => {
    const view = renderDetail()
    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(1)
    mockFocused = false
    view.rerender(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen deckId="deck-1" onBack={jest.fn()} />
      </ThemeProvider>,
    )
    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(1)
    mockFocused = true
    view.rerender(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen deckId="deck-1" onBack={jest.fn()} />
      </ThemeProvider>,
    )
    expect(mockCaptureAnalytics).toHaveBeenCalledTimes(2)
    expect(mockCaptureAnalytics).toHaveBeenLastCalledWith("stats_viewed", { surface: "deck" })
  })

  it("keeps the deck shell and selected tab through auth refresh without querying private data", () => {
    const request = jest.fn()
    const detail = (ready: boolean) => (
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          summary={{ name: "Existing Deck", game: "mtg", format: "commander" }}
          access={{ ready, loading: !ready, ownerId: "owner-a", request }}
        />
      </ThemeProvider>
    )
    const view = render(detail(false))
    expect(view.getByText("Existing Deck")).toBeTruthy()
    expect(queryArgs).toHaveLength(0)
    expect(view.queryByText("Sol Ring")).toBeNull()
    view.rerender(detail(true))
    fireEvent.press(view.getByTestId("deck-tab-notes"))
    expect(view.getByText("Ramp into big spells")).toBeTruthy()
    queryArgs.length = 0
    view.rerender(detail(false))
    expect(queryArgs).toHaveLength(0)
    expect(view.queryByText("Ramp into big spells")).toBeNull()
    view.rerender(detail(true))
    expect(view.getByText("Ramp into big spells")).toBeTruthy()
    expect(request).not.toHaveBeenCalled()
  })

  it("edits cached metadata offline and ignores rapid duplicate submits", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    const request = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{ ready: false, loading: false, signedIn: true, ownerId: "owner-a", request }}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Card list unavailable offline.")).toBeTruthy()
    expect(view.getByTestId("deck-add-cards")).toBeDisabled()
    expect(view.queryByText(/0 cards/)).toBeNull()
    fireEvent.press(view.getByTestId("deck-tab-notes"))
    fireEvent.press(view.getByText("Edit notes"))
    fireEvent.changeText(view.getByTestId("deck-note-input"), "Keep this draft")
    const saveNote = view.getByTestId("save-version-button")
    act(() => {
      fireEvent.press(saveNote)
      fireEvent.press(saveNote)
    })

    expect(mockUpdateMetadata).toHaveBeenCalledWith("deck-1", { note: "Keep this draft" }, 4)
    expect(mockUpdateMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveVersion).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()

    fireEvent.press(view.getByTestId("deck-settings-button"))
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Offline rename")
    const saveSettings = view.getByTestId("deck-settings-save")
    act(() => {
      fireEvent.press(saveSettings)
      fireEvent.press(saveSettings)
    })
    expect(mockUpdateMetadata).toHaveBeenLastCalledWith(
      "deck-1",
      {
        name: "Offline rename",
        format: "commander",
      },
      4,
    )
    expect(mockUpdateMetadata).toHaveBeenCalledTimes(2)
  })

  it("explains when the saved-edit queue has paused sync", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    mockMetadataWriteState.pending = [{ deckId: "deck-1" }]
    mockMetadataWriteState.capacityBlocked = true
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Sync paused. Resolve a saved local edit to continue.")).toBeTruthy()
  })

  it("keeps cached metadata hidden when sync is disabled", () => {
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          summary={{ name: "Existing Deck", game: "mtg", format: "commander" }}
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    expect(view.queryByText("Card list unavailable offline.")).toBeNull()
    expect(view.getByTestId("edit-deck-button")).toBeDisabled()
  })

  it("shows the latest failed metadata snapshot with explicit recovery actions", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockMetadataWriteState.metadata = [cachedMetadata]
    mockMetadataWriteState.pending = [{ deckId: "deck-1" }]
    const screen = () => (
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>
    )
    const view = render(screen())

    fireEvent.press(view.getByTestId("deck-tab-notes"))
    fireEvent.press(view.getByText("Edit notes"))
    fireEvent.changeText(view.getByTestId("deck-note-input"), "Unsent draft")
    mockMetadataWriteState.failures = [
      {
        failedAt: 2,
        reason: "Deck changed on another device. Choose which version to keep.",
        action: {
          operationId: "failed-edit",
          deckId: "deck-1",
          expectedRevision: 3,
          name: "Offline rename",
          format: "modern",
          game: "mtg",
          note: "Saved offline note",
        },
      },
    ]
    view.rerender(screen())

    expect(view.getByTestId("deck-note-input").props.value).toBe("Unsent draft")
    expect(view.queryByText(/CONVEX/)).toBeNull()
    fireEvent.press(view.getByText("Review changes"))
    expect(view.getByText("Account")).toBeTruthy()
    expect(view.getByText("This device")).toBeTruthy()
    expect(within(view.getByTestId("deck-sync-conflict")).getByText("Existing Deck")).toBeTruthy()
    expect(view.getByText("Offline rename")).toBeTruthy()
    expect(view.getByText("Modern")).toBeTruthy()
    expect(view.getByText("Saved offline note")).toBeTruthy()
    fireEvent.press(view.getByText("Later"))
    expect(mockDiscardMetadataFailure).not.toHaveBeenCalled()
    expect(mockReapplyMetadataFailure).not.toHaveBeenCalled()
    expect(view.getByTestId("deck-note-input").props.value).toBe("Unsent draft")
    fireEvent.press(view.getByText("Review changes"))
    fireEvent.press(view.getByText("Keep mine"))
    fireEvent.press(view.getByText("Review changes"))
    fireEvent.press(view.getByTestId("discard-deck-metadata"))
    expect(mockReapplyMetadataFailure).toHaveBeenCalledWith("failed-edit")
    expect(mockDiscardMetadataFailure).toHaveBeenCalledWith("failed-edit")
  })

  it("opens a requested review after failures load and lets it stay closed", () => {
    mockDeckSyncState.enabled = true
    mockMetadataWriteState.metadata = [cachedMetadata]
    const screen = () => (
      <ThemeProvider initialContext="dark">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          reviewChanges
          access={{ ready: true, loading: false, ownerId: "owner-a", request: jest.fn() }}
        />
      </ThemeProvider>
    )
    const view = render(screen())
    expect(view.queryByTestId("deck-sync-conflict")).toBeNull()
    mockMetadataWriteState.failures = [
      {
        failedAt: 1,
        reason: "Deck changed on another device. Choose which version to keep.",
        action: { ...cachedMetadata, name: "Local rename", operationId: "review-request" },
      },
    ]
    view.rerender(screen())
    expect(view.getByTestId("deck-sync-conflict")).toBeTruthy()
    fireEvent.press(view.getByText("Later"))
    view.rerender(screen())
    expect(view.queryByTestId("deck-sync-conflict")).toBeNull()
    expect(mockDiscardMetadataFailure).not.toHaveBeenCalled()
  })

  it("offers keep mine and keep account for a conflicted saved card list", () => {
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [cachedMetadata]
    mockVersionCacheState.version = {
      deckId: "deck-1",
      versionId: "version-main",
      revision: 2,
      versionNumber: 1,
      name: "Main",
      note: "",
      fingerprint: "f1",
      cardCount: 1,
      cardQuantity: 2,
      deleted: false,
      updatedAt: 1,
    }
    mockVersionCacheState.cards = [solRing]
    const screen = () => (
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: false,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>
    )
    const view = render(screen())
    mockVersionCardWriteState.failures = [
      {
        failedAt: 2,
        reason: "Deck cards changed on another device. Choose which card list to keep.",
        action: {
          operationId: "card-conflict",
          deckId: "deck-1",
          versionId: "version-main",
          expectedRevision: 2,
          cards: [{ name: "Sol Ring", quantity: 2 }],
          queuedAt: 1,
        },
      },
    ]
    view.rerender(screen())

    expect(view.getByText("Local edit not synced")).toBeTruthy()
    fireEvent.press(view.getByText("Review changes"))
    expect(view.getByTestId("version-sync-conflict")).toBeTruthy()
    expect(view.getByText("Keep which card list?")).toBeTruthy()
    expect(view.getByText("2 cards · 1 entries")).toBeTruthy()
    expect(view.getByText(/Your edits are still saved on this device/)).toBeTruthy()
    fireEvent.press(view.getByText("Later"))
    expect(mockVersionCardReapply).not.toHaveBeenCalled()
    expect(mockVersionCardDiscard).not.toHaveBeenCalled()
    fireEvent.press(view.getByText("Review changes"))
    fireEvent.press(view.getByText("Keep mine"))
    fireEvent.press(view.getByText("Review changes"))
    fireEvent.press(view.getByTestId("discard-version-cards"))
    expect(mockVersionCardReapply).toHaveBeenCalledWith("card-conflict")
    expect(mockVersionCardDiscard).toHaveBeenCalledWith("card-conflict")
  })

  it("compares only changed fields for a rename conflict", () => {
    mockMetadataWriteState.metadata = [cachedMetadata]
    mockDeckSyncState.enabled = true
    mockMetadataWriteState.failures = [
      {
        failedAt: 1,
        reason: "Deck changed on another device. Choose which version to keep.",
        action: { ...cachedMetadata, name: "Renamed deck", operationId: "rename-conflict" },
      },
    ]
    const view = renderDetail({
      ready: true,
      loading: false,
      signedIn: true,
      ownerId: "owner-a",
      request: jest.fn(),
    })
    fireEvent.press(view.getByText("Review changes"))
    const sheet = within(view.getByTestId("deck-sync-conflict"))
    expect(sheet.getByText("Renamed deck")).toBeTruthy()
    expect(sheet.getByText("Existing Deck")).toBeTruthy()
    expect(sheet.queryByText("Format")).toBeNull()
    expect(sheet.queryByText("Notes")).toBeNull()
    fireEvent.press(sheet.getByText("Keep account"))
    expect(mockDiscardMetadataFailure).toHaveBeenCalledWith("rename-conflict")
  })

  it.each([
    ["This format is not available", "This format is not available"],
    [
      "[CONVEX M(decks:syncWrite)] Server Error",
      "This edit could not be synced. Try again or discard it.",
    ],
  ])("shows a readable reason for non-conflict failures: %s", (reason, message) => {
    mockDeckSyncState.enabled = true
    mockMetadataWriteState.failures = [
      {
        failedAt: 1,
        reason,
        action: { ...cachedMetadata, operationId: "rejected-edit" },
      },
    ]
    const view = renderDetail({
      ready: true,
      loading: false,
      signedIn: true,
      ownerId: "owner-a",
      request: jest.fn(),
    })
    fireEvent.press(view.getByText("Review changes"))
    expect(view.getByText(message)).toBeTruthy()
    expect(view.queryByText(/CONVEX/)).toBeNull()
    expect(view.queryByText("Account")).toBeNull()
    fireEvent.press(view.getByText("Discard local edit"))
    expect(mockDiscardMetadataFailure).toHaveBeenCalledWith("rejected-edit")
  })

  it("keeps a failed edit inspectable when the remote deck was deleted", () => {
    const tombstone = { ...cachedMetadata, revision: 6, deleted: true }
    mockDeckSyncState.enabled = true
    mockDeckSyncState.metadata = [tombstone]
    mockMetadataWriteState.metadata = [tombstone]
    mockMetadataWriteState.failures = [
      {
        failedAt: 3,
        reason: "Deck was deleted",
        action: {
          operationId: "deleted-edit",
          deckId: "deck-1",
          expectedRevision: 5,
          name: "Private draft",
          format: "commander",
          game: "mtg",
          note: "Still recoverable",
        },
      },
    ]
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          onBack={jest.fn()}
          access={{
            ready: true,
            loading: false,
            signedIn: true,
            ownerId: "owner-a",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    expect(queryArgs).toHaveLength(0)
    fireEvent.press(view.getByText("Review changes"))
    expect(view.getByText("Name: Private draft")).toBeTruthy()
    expect(view.getByText("Note: Still recoverable")).toBeTruthy()
    expect(view.getByText("Local edit not synced")).toBeTruthy()
    expect(view.getByText("Retry sync")).toBeDisabled()
    expect(view.getByTestId("edit-deck-button")).toBeDisabled()
    expect(view.getByTestId("deck-settings-button")).toBeDisabled()
    expect(view.getByTestId("deck-add-cards")).toBeDisabled()
    fireEvent.press(view.getByTestId("deck-tab-notes"))
    expect(view.getByTestId("edit-deck-notes")).toBeDisabled()
    fireEvent.press(view.getByTestId("discard-deck-metadata"))
    expect(mockDiscardMetadataFailure).toHaveBeenCalledWith("deleted-edit")
  })

  it("keeps same-name Pokemon reprints distinct when only original references identify them", () => {
    expect(
      cardDetailsKey(
        { game: "pokemon", name: "Pikachu", originalReference: "MEG 76", quantity: 1 },
        "pokemon",
      ),
    ).not.toBe(
      cardDetailsKey(
        { game: "pokemon", name: "Pikachu", originalReference: "SVI 62", quantity: 1 },
        "pokemon",
      ),
    )
  })

  it("opens read-only with the deck, its notes, and the selected version's record", () => {
    const view = renderDetail()
    expect(view.getByText("Magic · Commander · 1 card")).toBeTruthy()
    expect(
      view.queryByTestId("deck-card-thumbnail-main:22222222-2222-2222-2222-222222222222"),
    ).toBeNull()
    expect(view.getByText("1×")).toBeTruthy()
    expect(view.getByText("Sol Ring")).toBeTruthy()
    fireEvent.press(view.getByTestId("deck-tab-notes"))
    expect(view.getByText("Ramp into big spells")).toBeTruthy()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    expect(view.getByText("The list I actually sleeve")).toBeTruthy()
    expect(view.getByText("3–1")).toBeTruthy()
    expect(view.getAllByText("1 card").length).toBeGreaterThan(0)
    expect(
      StyleSheet.flatten(view.getByTestId("version-marker-version-main").props.style)
        .backgroundColor,
    ).toBe(colors.gameMenu.actions.history)
    expect(view.queryByText(/Premium/)).toBeNull()
  })

  it("shows the selected deck context while its detail loads", () => {
    mockDetail.value = undefined
    const name = "Scions & Spellcraft Collector's Edition (FINAL FANTASY XIV)"
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          summary={{
            name,
            game: "mtg",
            format: "commander",
            cardQuantity: 100,
          }}
          onBack={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getAllByText(name)).toHaveLength(1)
    expect(view.getByText("Magic · Commander · 100 cards")).toBeTruthy()
    expect(view.getByTestId("deck-tab-cards")).toBeTruthy()
    expect(view.getByTestId("current-version-button")).toBeTruthy()
    expect(view.getByText("Commander")).toBeTruthy()
    expect(view.getByText("Main deck")).toBeTruthy()
    expect(view.getByTestId("edit-deck-button")).toBeDisabled()
  })

  it("saves combined card and note edits once after a rapid double submit", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    expect(view.getByText("Edit deck")).toBeTruthy()
    expect(view.getByText("Cancel")).toBeTruthy()
    expect(view.queryByTestId("card-search-input")).toBeNull()
    expect(view.queryByText("Record")).toBeNull()
    expect(view.queryByTestId("deck-tab-versions")).toBeNull()
    fireEvent.press(view.getAllByText("+")[0])
    fireEvent.press(view.getByTestId("deck-tab-notes"))
    fireEvent.changeText(view.getByTestId("deck-note-input"), "Updated note")
    const save = view.getByTestId("save-version-button")
    act(() => {
      fireEvent.press(save)
      fireEvent.press(save)
    })
    await waitFor(() => expect(mockSaveVersion).toHaveBeenCalledTimes(1))
    expect(mockSaveVersion).toHaveBeenCalledWith({
      deckId: "deck-1",
      versionId: "version-main",
      cards: [expect.objectContaining({ name: "Sol Ring", quantity: 2 })],
    })
    expect(mockUpdateDeck).toHaveBeenCalledTimes(1)
    expect(mockUpdateDeck).toHaveBeenCalledWith({ deckId: "deck-1", note: "Updated note" })
  })

  it("protects changed edits behind confirmation", () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    fireEvent.press(view.getAllByText("+")[0])
    expect(view.getByLabelText("2× Sol Ring")).toBeTruthy()
    fireEvent.press(view.getByText("Cancel"))
    expect(view.getByTestId("discard-edits-dialog")).toBeTruthy()
    fireEvent.press(view.getByTestId("discard-edits-confirm"))
    expect(view.getByLabelText("1× Sol Ring")).toBeTruthy()
    expect(mockSaveVersion).not.toHaveBeenCalled()
  })

  it("replays native navigation only after changed edits are discarded", () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    fireEvent.press(view.getAllByText("+")[0])
    const action = { type: "GO_BACK" }

    act(() => mockPreventRemoveCallback?.({ data: { action } }))
    expect(view.getByTestId("discard-edits-dialog")).toBeTruthy()
    expect(mockNavigationDispatch).not.toHaveBeenCalled()

    fireEvent.press(view.getByTestId("discard-edits-confirm"))
    expect(mockNavigationDispatch).toHaveBeenCalledWith(action)
  })

  it("does not replay cancelled navigation after saving", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    fireEvent.press(view.getAllByText("+")[0])
    act(() => mockPreventRemoveCallback?.({ data: { action: { type: "GO_BACK" } } }))
    fireEvent.press(view.getByText("Keep editing"))
    fireEvent.press(view.getByText("Save"))
    await waitFor(() => expect(mockSaveVersion).toHaveBeenCalled())
    expect(mockNavigationDispatch).not.toHaveBeenCalled()
  })

  it("opens the shared card dialog with provider details for a Yu-Gi-Oh card", async () => {
    mockDetail.value = {
      ...loadedDetail,
      deck: { ...loadedDetail.deck, game: "ygo", format: "advanced" },
      cards: [
        {
          _id: "card-ygo",
          _creationTime: 0,
          deckVersionId: "version-main",
          game: "ygo",
          cardId: "14558127",
          providerCardId: "14558127",
          printingId: "14558127",
          name: "Ash Blossom & Joyous Spring",
          quantity: 3,
          section: "main",
        },
      ],
    }
    const view = renderDetail()

    fireEvent.press(view.getByLabelText("3× Ash Blossom & Joyous Spring"))

    await waitFor(() => expect(view.getByTestId("card-focus-dialog")).toBeTruthy())
    expect(mockCatalogCardById).toHaveBeenCalledWith({ game: "ygo", cardId: "14558127" })
    expect(view.getByText("Effect Monster")).toBeTruthy()
  })

  it("resolves a saved Pokemon card from its original set reference", async () => {
    mockDetail.value = {
      ...loadedDetail,
      deck: { ...loadedDetail.deck, game: "pokemon", format: "standard" },
      cards: [
        {
          _id: "card-pokemon",
          _creationTime: 0,
          deckVersionId: "version-main",
          game: "pokemon",
          originalReference: "MEG 76",
          name: "Riolu",
          quantity: 3,
          section: "main",
        },
      ],
    }
    const view = renderDetail()

    fireEvent.press(view.getByLabelText("3× Riolu"))

    await waitFor(() => expect(view.getByText("Pokemon · Basic · Fighting")).toBeTruthy())
    expect(mockPokemonCardByReference).toHaveBeenCalledWith({
      name: "Riolu",
      originalReference: "MEG 76",
    })
  })

  it("switches the version being viewed", () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    fireEvent.press(view.getByTestId("version-picker-version-sideboard"))
    expect(queryArgs.at(-1)).toEqual({ deckId: "deck-1", versionId: "version-sideboard" })
  })

  it("creates a version seeded from the one on screen", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    fireEvent.press(view.getByTestId("version-picker-__new__"))
    fireEvent.changeText(view.getByTestId("version-name-input"), "Budget swap")
    fireEvent.changeText(view.getByTestId("version-note-input"), "Cut the fast mana")
    fireEvent.press(view.getByTestId("version-submit"))
    await waitFor(() => expect(mockCreateVersion).toHaveBeenCalledTimes(1))
    expect(mockCreateVersion).toHaveBeenCalledWith({
      deckId: "deck-1",
      name: "Budget swap",
      note: "Cut the fast mana",
      fromVersionId: "version-main",
    })
  })

  it("points free accounts at premium instead of opening the version editor", () => {
    mockDetail.value = {
      ...(mockDetail.value as Record<string, unknown>),
      capacity: { used: 1, limit: 1, premium: false, canCreate: false },
    }
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    fireEvent.press(view.getByTestId("version-picker-__new__"))
    expect(view.queryByTestId("deck-version-dialog")).toBeNull()
    expect(
      view.getByText("This deck holds up to 1 version. Delete one to add another."),
    ).toBeTruthy()
    expect(view.queryByText(/Premium/)).toBeNull()
  })

  it("deletes the selected version from the version editor behind a confirmation", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    fireEvent.press(view.getByTestId("rename-version-button"))
    fireEvent.press(view.getByTestId("delete-version-button"))
    fireEvent.press(view.getByTestId("delete-version-confirm"))
    await waitFor(() =>
      expect(mockDeleteVersion).toHaveBeenCalledWith({ versionId: "version-main" }),
    )
  })

  it("hides version deletion when the deck has only one version", () => {
    mockDetail.value = {
      ...(mockDetail.value as Record<string, unknown>),
      versions: [mainVersion],
    }
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    fireEvent.press(view.getByTestId("rename-version-button"))
    expect(view.queryByTestId("delete-version-button")).toBeNull()
  })

  it("archives the deck from deck settings behind a confirmation", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
    expect(view.getByText("Save changes")).toBeTruthy()
    expect(view.getByTestId("deck-format-picker")).toBeTruthy()
    expect(view.queryByText("Cancel")).toBeNull()
    fireEvent.press(view.getByTestId("delete-deck-button"))
    fireEvent.press(view.getByTestId("delete-deck-confirm"))
    await waitFor(() => expect(mockArchiveDeck).toHaveBeenCalledWith({ deckId: "deck-1" }))
  })

  it("keeps detail geometry visible and retries an unavailable query", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockDetail.error = new Error("Network unavailable")
    const view = render(
      <ThemeProvider initialContext="light">
        <DeckDetailScreen
          deckId="deck-1"
          summary={{ name: "Existing Deck", game: "mtg", format: "commander", cardQuantity: 100 }}
          onBack={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("Deck unavailable")).toBeTruthy()
    expect(view.getByText("Magic · Commander · 100 cards")).toBeTruthy()
    expect(view.getByTestId("deck-tab-cards")).toBeTruthy()
    expect(view.getByTestId("current-version-button")).toBeTruthy()
    expect(view.getByTestId("edit-deck-button")).toBeDisabled()

    mockDetail.error = undefined
    fireEvent.press(view.getByTestId("retry-deck-detail"))
    expect(view.getByLabelText("1× Sol Ring")).toBeTruthy()
    consoleError.mockRestore()
  })

  it("distinguishes a missing deck from a temporary failure", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    mockDetail.error = new Error("Deck not found")
    const view = renderDetail()

    expect(view.getByText("Deck not found")).toBeTruthy()
    expect(view.getByText("This deck may have been deleted.")).toBeTruthy()
    expect(view.queryByTestId("retry-deck-detail")).toBeNull()
    consoleError.mockRestore()
  })
})
