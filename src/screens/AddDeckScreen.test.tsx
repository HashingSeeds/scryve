import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { deleteGuestDeck, loadGuestDeck, saveGuestDeck } from "@/features/decks/guestDeck"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

import { AddDeckScreen, catalogPreviewSections } from "./AddDeckScreen"

const mockCreate = jest.fn()
const mockGuestImport = jest.fn()
const mockArchive = jest.fn(async () => null)
const mockImport = jest.fn(async () => "deck-imported")
const mockSearch = jest.fn(async () => [
  {
    fileName: "ExplorersOfTheDeep_LCC",
    name: "Explorers of the Deep",
    code: "LCC",
    type: "Commander Deck",
  },
])
const mockResolvePrecon = jest.fn(async () => ({
  name: "Explorers of the Deep",
  unresolved: [],
  cards: [
    {
      oracleId: "11111111-1111-1111-1111-111111111111",
      scryfallId: "22222222-2222-2222-2222-222222222222",
      name: "Hakbal of the Surging Soul",
      quantity: 1,
      board: "commander",
    },
  ],
}))
const mockPreviewPrecon = jest.fn(async () => ({
  name: "Explorers of the Deep",
  cards: [
    {
      scryfallId: "22222222-2222-2222-2222-222222222222",
      name: "Hakbal of the Surging Soul",
      quantity: 1,
      board: "commander",
    },
  ],
}))
const mockResolvePasted = jest.fn()
type MockCatalogDeck = {
  _id: string
  game: string
  name: string
  kind: string
  format?: string
}
const mockSearchTopDecks = jest.fn(async (): Promise<MockCatalogDeck[]> => [])
const mockCatalogDetail: {
  value:
    | {
        deck: { _id: string; game: string; name: string; kind: string; format?: string }
        entries: Array<{
          _id: string
          game: string
          cardId?: string
          originalReference?: string
          name: string
          quantity: number
          section: string
          imageUrl?: string
          smallImageUrl?: string
        }>
      }
    | undefined
} = { value: undefined }
const mockCardById = jest.fn(async () => ({
  manaCost: "{1}{G}{U}",
  typeLine: "Legendary Creature — Merfolk Scout",
  oracleText: "Explore twice.",
  setName: "The Lost Caverns of Ixalan Commander",
  collectorNumber: "3",
  rarity: "mythic",
}))
const mockCatalogCardById = jest.fn(async () => ({
  typeLabel: "Effect Monster",
  text: "Discard this card; negate that effect.",
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
  imageUrl: "https://assets.example/riolu/high.webp",
}))
type DeckShelfState = {
  decks: Array<{
    _id: string
    name: string
    format: string
    game: string
    versionCount: number
    cardQuantity: number
    coverImageUrl?: string
  }>
  capacity: { used: number; limit: number; premium: boolean; canCreate: boolean }
  analyticsLocked: boolean
}

const readyShelf: DeckShelfState = {
  decks: [
    {
      _id: "existing-deck",
      name: "Existing Deck",
      format: "commander",
      game: "mtg",
      versionCount: 1,
      cardQuantity: 100,
      coverImageUrl: undefined,
    },
  ],
  capacity: { used: 1, limit: 100, premium: true, canCreate: true },
  analyticsLocked: false,
}

const mockListMine: {
  value: DeckShelfState | undefined
  error: Error | undefined
} = {
  value: readyShelf,
  error: undefined,
}

jest.mock("convex/react", () => ({
  useQuery: (reference: string) => {
    if (reference === "deckCatalogs.detail") return mockCatalogDetail.value
    if (mockListMine.error) throw mockListMine.error
    return mockListMine.value
  },
  useMutation: (reference: string) =>
    reference === "decks.archive"
      ? mockArchive
      : reference === "decks.importGuest"
        ? mockGuestImport
        : reference === "decks.importResolved" || reference === "decks.importCatalog"
          ? mockImport
          : mockCreate,
  useAction: (reference: string) => {
    if (reference === "cards.byId") return mockCardById
    if (reference === "cards.byCatalogId") return mockCatalogCardById
    if (reference === "cards.byPokemonReference") return mockPokemonCardByReference
    if (reference === "deckCatalogs.searchTopDecks") return mockSearchTopDecks
    if (reference === "deckImports.searchPreconstructed") return mockSearch
    if (reference === "deckImports.previewPreconstructed") return mockPreviewPrecon
    if (reference === "deckImports.resolvePreconstructed") return mockResolvePrecon
    return mockResolvePasted
  },
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    decks: {
      listMine: "decks.listMine",
      importGuest: "decks.importGuest",
      archive: "decks.archive",
      create: "decks.create",
      importResolved: "decks.importResolved",
      importCatalog: "decks.importCatalog",
    },
    deckImports: {
      searchPreconstructed: "deckImports.searchPreconstructed",
      previewPreconstructed: "deckImports.previewPreconstructed",
      resolvePreconstructed: "deckImports.resolvePreconstructed",
      resolvePasted: "deckImports.resolvePasted",
    },
    cards: {
      byId: "cards.byId",
      byCatalogId: "cards.byCatalogId",
      byPokemonReference: "cards.byPokemonReference",
    },
    deckCatalogs: {
      detail: "deckCatalogs.detail",
      searchTopDecks: "deckCatalogs.searchTopDecks",
    },
  },
}))

function atCapacity() {
  mockListMine.value = {
    ...readyShelf,
    decks: [
      ...readyShelf.decks,
      {
        _id: "second-deck",
        name: "Second Deck",
        format: "standard",
        game: "mtg",
        versionCount: 1,
        cardQuantity: 60,
      },
    ],
    capacity: { used: 2, limit: 2, premium: false, canCreate: false },
  }
}

function renderAddDeck(onCreated = jest.fn()) {
  return render(
    <ThemeProvider initialContext="light">
      <AddDeckScreen onBack={jest.fn()} onCreated={onCreated} />
    </ThemeProvider>,
  )
}

function chooseFormat(view: ReturnType<typeof renderAddDeck>, format: string) {
  fireEvent.press(view.getByTestId("format-picker-options"))
  fireEvent.press(view.getByTestId(`format-picker-options-option-${format}`))
}

function chooseGame(view: ReturnType<typeof renderAddDeck>, game: string) {
  fireEvent.press(view.getByTestId("game-picker-options"))
  fireEvent.press(view.getByTestId(`game-picker-options-option-${game}`))
}

function chooseMode(view: ReturnType<typeof renderAddDeck>, mode: string) {
  fireEvent.press(view.getByTestId(`mode-picker-options-${mode}`))
}

function continueSetup(_view: ReturnType<typeof renderAddDeck>) {}

describe("AddDeckScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clear()
    deleteGuestDeck()
    jest.useFakeTimers()
    mockListMine.value = {
      ...readyShelf,
      capacity: { used: 1, limit: 100, premium: true, canCreate: true },
    }
    mockListMine.error = undefined
    mockCatalogDetail.value = undefined
  })

  it("keeps a pasted draft through sign-in and waits to call private APIs", async () => {
    const request = jest.fn()
    const onCreated = jest.fn()
    const renderForm = (ready: boolean) => (
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={onCreated}
          access={{ ready, loading: false, request, ownerId: ready ? "owner-a" : undefined }}
        />
      </ThemeProvider>
    )
    const view = render(renderForm(false))
    act(() => jest.advanceTimersByTime(500))
    expect(mockSearch).toHaveBeenCalled()
    expect(mockSearchTopDecks).not.toHaveBeenCalled()
    expect(view.queryByTestId("deck-capacity-status")).toBeNull()
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "My draft")
    fireEvent.changeText(view.getByLabelText("Deck list"), "1 Sol Ring")
    fireEvent.press(view.getByText("Import deck list"))
    expect(request).toHaveBeenCalledTimes(1)
    expect(mockResolvePasted).not.toHaveBeenCalled()
    view.rerender(renderForm(true))
    expect(view.getByTestId("deck-name-input").props.value).toBe("My draft")
    expect(view.getByLabelText("Deck list").props.value).toBe("1 Sol Ring")
    expect(view.getByTestId("deck-capacity-status")).toBeTruthy()
  })

  it("allows a new deck after a guest transfer fails without deleting the guest", async () => {
    const saved = saveGuestDeck({ name: "Keep me", game: "mtg", format: "commander", cards: [] })
    mockGuestImport.mockRejectedValueOnce(new Error("Sync unavailable"))
    const view = render(
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={jest.fn()}
          access={{
            ready: true,
            loading: false,
            signedIn: true,
            ownerId: "owner",
            request: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "New draft")
    await waitFor(() => expect(view.getByText("Create deck")).toBeEnabled())
    expect(loadGuestDeck()?.localId).toBe(saved.localId)
  })

  it("imports the saved guest after sign-in without losing the second deck draft", async () => {
    const saved = saveGuestDeck({ name: "First deck", game: "mtg", format: "commander", cards: [] })
    mockGuestImport.mockResolvedValue({
      status: "imported",
      deckId: "first-remote",
      localUpdatedAt: saved.updatedAt,
    })
    const form = (ready: boolean) => (
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={jest.fn()}
          access={{
            ready,
            loading: false,
            signedIn: ready,
            ownerId: ready ? "owner" : undefined,
            request: jest.fn(),
          }}
        />
      </ThemeProvider>
    )
    const view = render(form(false))
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Second deck")
    fireEvent.press(view.getByText("Create deck"))
    expect(view.getByText("Keep another deck")).toBeTruthy()
    view.rerender(form(true))
    await waitFor(() => expect(loadGuestDeck()).toBeUndefined())
    expect(mockGuestImport).toHaveBeenCalledWith(
      expect.objectContaining({ name: "First deck", localId: saved.localId }),
    )
    expect(view.getByTestId("deck-name-input").props.value).toBe("Second deck")
    expect(view.getByText("Create deck")).toBeEnabled()
    fireEvent.press(view.getByText("Create deck"))
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Second deck" })),
    )
  })

  it("puts unknown catalog sections in a visible deterministic fallback", () => {
    const sections = catalogPreviewSections(
      [
        { _id: "main-card", name: "Known", section: "main", quantity: 2 },
        { _id: "unknown-card", name: "Mystery", section: "bench", quantity: 3 },
      ] as never,
      [{ id: "main", label: "Deck" }],
    )

    expect(sections).toEqual([
      {
        id: "main",
        label: "Deck",
        entries: [{ _id: "main-card", name: "Known", section: "main", quantity: 2 }],
      },
      {
        id: "other",
        label: "Other",
        entries: [{ _id: "unknown-card", name: "Mystery", section: "bench", quantity: 3 }],
      },
    ])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("offers official, pasted, and scratch-built creation paths", () => {
    const view = renderAddDeck()
    expect(view.getByText("Official deck")).toBeTruthy()
    chooseMode(view, "paste")
    expect(view.getByText("Deck list")).toBeTruthy()
    chooseMode(view, "blank")
    expect(view.getByText("Create deck")).toBeTruthy()
  })

  it("saves a valid blank deck locally for a guest", () => {
    const onCreated = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={onCreated}
          access={{ ready: false, loading: false, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>,
    )
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Guest deck")
    fireEvent.press(view.getByText("Create deck"))
    expect(onCreated).toHaveBeenCalledWith("guest")
  })

  it("waits for auth resolution before enabling guest save", () => {
    const onCreated = jest.fn()
    const form = (loading: boolean) => (
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={onCreated}
          access={{ ready: false, loading, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>
    )
    const view = render(form(true))
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Guest deck")
    expect(view.getByText("Create deck")).toBeDisabled()

    view.rerender(form(false))
    expect(view.getByText("Create deck")).toBeEnabled()
    fireEvent.press(view.getByText("Create deck"))
    expect(onCreated).toHaveBeenCalledWith("guest")
  })

  it("reveals guest replacement recovery after the second save and disables save", () => {
    const existing = saveGuestDeck({
      name: "Existing",
      format: "commander",
      game: "mtg",
      cards: [],
    })
    const onCreated = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={onCreated}
          access={{ ready: false, loading: false, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>,
    )
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "New deck")
    fireEvent.press(view.getByText("Create deck"))
    expect(view.getByText("Keep another deck")).toBeTruthy()
    expect(view.getByText("Create deck")).toBeDisabled()

    fireEvent.press(view.getByText("Replace local deck"))
    expect(view.getByTestId("confirm-guest-replace")).toBeTruthy()
    fireEvent.press(view.getByTestId("cancel-guest-replace"))
    expect(onCreated).not.toHaveBeenCalled()

    fireEvent.press(view.getByText("Replace local deck"))
    fireEvent.press(view.getByTestId("confirm-guest-replace-action"))
    expect(onCreated).toHaveBeenCalledWith("guest")
    expect(loadGuestDeck()?.localId).not.toBe(existing.localId)
    expect(loadGuestDeck()?.deck.name).toBe("New deck")
  })

  it("searches public official decks while guest access is ready", async () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={jest.fn()}
          access={{ ready: false, loading: false, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>,
    )
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => jest.advanceTimersByTime(400))
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())
    expect(mockSearch).toHaveBeenCalledWith({ query: "Explorers", format: "commander" })
  })

  it("previews an official deck before importing it", async () => {
    const onCreated = jest.fn()
    const view = renderAddDeck(onCreated)
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())
    expect(mockSearch).toHaveBeenLastCalledWith({ query: "Explorers", format: "commander" })
    fireEvent.press(view.getByText("Explorers of the Deep"))
    await waitFor(() => expect(view.getByTestId("precon-preview")).toBeTruthy())
    expect(mockResolvePrecon).toHaveBeenCalledWith({ fileName: "ExplorersOfTheDeep_LCC" })
    expect(mockImport).not.toHaveBeenCalled()
    expect(view.getByText("Magic · Commander · 1 card")).toBeTruthy()
    expect(view.getByText("1× Hakbal of the Surging Soul")).toBeTruthy()
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    fireEvent.press(view.getByTestId("import-preview-button"))
    await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1))
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Explorers of the Deep",
        format: "commander",
        game: "mtg",
      }),
    )
    expect(onCreated).toHaveBeenCalledWith("deck-imported")
  })

  it("keeps the selected deck visible while its outline loads", async () => {
    mockPreviewPrecon.mockImplementationOnce(() => new Promise(() => undefined))
    const view = renderAddDeck()
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())

    fireEvent.press(view.getByText("Explorers of the Deep"))

    expect(view.getByTestId("precon-preview")).toBeTruthy()
    expect(view.getByText("Explorers of the Deep")).toBeTruthy()
    expect(view.getByTestId("precon-loading-progress")).toBeTruthy()
  })

  it("shows the official card outline before Scryfall hydration finishes", async () => {
    mockResolvePrecon.mockImplementationOnce(() => new Promise(() => undefined))
    const view = renderAddDeck()
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())

    fireEvent.press(view.getByText("Explorers of the Deep"))

    await waitFor(() => expect(mockPreviewPrecon).toHaveBeenCalledTimes(1))
    expect(view.getByText("1× Hakbal of the Surging Soul")).toBeTruthy()
    expect(view.getByTestId("precon-loading-progress")).toBeTruthy()
    expect(view.getByTestId("import-preview-button").props.accessibilityState.disabled).toBe(true)
  })

  it("opens a read-only card preview from the deck preview", async () => {
    const view = renderAddDeck()
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())
    fireEvent.press(view.getByText("Explorers of the Deep"))
    await waitFor(() => expect(view.getByTestId("precon-preview")).toBeTruthy())

    fireEvent.press(view.getByLabelText("Preview Hakbal of the Surging Soul"))

    await waitFor(() => expect(view.getByTestId("card-focus-dialog")).toBeTruthy())
    expect(mockCardById).toHaveBeenCalledWith({
      scryfallId: "22222222-2222-2222-2222-222222222222",
    })
    expect(view.getByText("Legendary Creature — Merfolk Scout")).toBeTruthy()
    expect(view.queryByTestId("card-focus-increment")).toBeNull()
    expect(view.queryByTestId("card-focus-decrement")).toBeNull()
  })

  it("starts importing only from the preview page", async () => {
    let finishImport: ((deckId: string) => void) | undefined
    mockSearch.mockResolvedValueOnce([
      {
        fileName: "ExplorersOfTheDeep_LCC",
        name: "Explorers of the Deep",
        code: "LCC",
        type: "Commander Deck",
      },
      {
        fileName: "CavalryCharge_MOC",
        name: "Cavalry Charge",
        code: "MOC",
        type: "Commander Deck",
      },
    ])
    mockImport.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finishImport = resolve)),
    )
    const view = renderAddDeck()
    continueSetup(view)
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    await waitFor(() => expect(view.getByText("Cavalry Charge")).toBeTruthy())
    fireEvent.press(view.getByText("Explorers of the Deep"))
    await waitFor(() => expect(view.getByTestId("precon-preview")).toBeTruthy())
    expect(mockImport).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("import-preview-button"))
    await waitFor(() => expect(view.getByText("Importing…")).toBeTruthy())
    await act(async () => finishImport?.("deck-imported"))
  })

  it("browses a format with no search term at all", async () => {
    const view = renderAddDeck()
    chooseFormat(view, "brawl")
    continueSetup(view)
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    expect(mockSearch).toHaveBeenLastCalledWith({ query: "", format: "brawl" })
  })

  it("loads each system with a valid default format and filters Top Decks by format", async () => {
    const view = renderAddDeck()

    chooseGame(view, "ygo")
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByTestId("format-picker-options").props.accessibilityLabel).toBe(
      "Format, Advanced",
    )
    expect(mockSearchTopDecks).toHaveBeenLastCalledWith({
      game: "ygo",
      format: "advanced",
      query: "",
    })

    chooseFormat(view, "traditional")
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockSearchTopDecks).toHaveBeenLastCalledWith({
      game: "ygo",
      format: "traditional",
      query: "",
    })

    chooseGame(view, "mtg")
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByTestId("format-picker-options").props.accessibilityLabel).toBe(
      "Format, Commander",
    )
    expect(mockSearch).toHaveBeenLastCalledWith({ query: "", format: "commander" })
  })

  it("ignores a Top Deck search that finishes after the format changes", async () => {
    let finishAdvancedSearch: ((decks: MockCatalogDeck[]) => void) | undefined
    mockSearchTopDecks
      .mockImplementationOnce(
        () =>
          new Promise<MockCatalogDeck[]>((resolve) => {
            finishAdvancedSearch = resolve
          }),
      )
      .mockResolvedValueOnce([
        {
          _id: "traditional-deck",
          game: "ygo",
          name: "Current Traditional Deck",
          kind: "tournament",
          format: "traditional",
        },
      ])
    const view = renderAddDeck()

    chooseGame(view, "ygo")
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockSearchTopDecks).toHaveBeenLastCalledWith({
      game: "ygo",
      format: "advanced",
      query: "",
    })

    chooseFormat(view, "traditional")
    await act(async () => {
      finishAdvancedSearch?.([
        {
          _id: "stale-advanced-deck",
          game: "ygo",
          name: "Stale Advanced Deck",
          kind: "tournament",
          format: "advanced",
        },
      ])
    })
    expect(view.queryByText("Stale Advanced Deck")).toBeNull()

    await act(async () => jest.advanceTimersByTime(400))
    await waitFor(() => expect(view.getByText("Current Traditional Deck")).toBeTruthy())
  })

  it("resets the shared format when changing systems", () => {
    const view = renderAddDeck()

    chooseFormat(view, "modern")
    chooseGame(view, "ygo")

    expect(view.getByTestId("format-picker-options").props.accessibilityLabel).toBe(
      "Format, Advanced",
    )
  })

  it("opens the shared card dialog from a Top Deck preview", async () => {
    mockSearchTopDecks.mockResolvedValueOnce([
      {
        _id: "catalog-ygo",
        game: "ygo",
        name: "Sample Yu-Gi-Oh deck",
        kind: "tournament",
        format: "advanced",
      },
    ])
    mockCatalogDetail.value = {
      deck: {
        _id: "catalog-ygo",
        game: "ygo",
        name: "Sample Yu-Gi-Oh deck",
        kind: "tournament",
        format: "advanced",
      },
      entries: [
        {
          _id: "catalog-card-ygo",
          game: "ygo",
          cardId: "14558127",
          name: "Ash Blossom & Joyous Spring",
          quantity: 3,
          section: "main",
          imageUrl: "https://example.com/ash.jpg",
        },
      ],
    }
    const view = renderAddDeck()

    chooseGame(view, "ygo")
    await act(async () => jest.advanceTimersByTime(400))
    await waitFor(() => expect(view.getByText("Sample Yu-Gi-Oh deck")).toBeTruthy())
    fireEvent.press(view.getByText("Sample Yu-Gi-Oh deck"))
    fireEvent.press(view.getByLabelText("Preview Ash Blossom & Joyous Spring"))

    expect(view.getByTestId("card-focus-dialog")).toBeTruthy()
    expect(view.getByText("Ash Blossom & Joyous Spring")).toBeTruthy()
    await waitFor(() => expect(view.getByText("Effect Monster")).toBeTruthy())
    expect(mockCatalogCardById).toHaveBeenCalledWith({ game: "ygo", cardId: "14558127" })
  })

  it("resolves a Pokemon Top Deck card from its provider reference", async () => {
    mockSearchTopDecks.mockResolvedValueOnce([
      {
        _id: "catalog-pokemon",
        game: "pokemon",
        name: "Lucario Hariyama",
        kind: "tournament",
        format: "standard",
      },
    ])
    mockCatalogDetail.value = {
      deck: {
        _id: "catalog-pokemon",
        game: "pokemon",
        name: "Lucario Hariyama",
        kind: "tournament",
        format: "standard",
      },
      entries: [
        {
          _id: "catalog-card-riolu",
          game: "pokemon",
          originalReference: "MEG 76",
          name: "Riolu",
          quantity: 3,
          section: "main",
        },
      ],
    }
    const view = renderAddDeck()

    chooseGame(view, "pokemon")
    await act(async () => jest.advanceTimersByTime(400))
    await waitFor(() => expect(view.getByText("Lucario Hariyama")).toBeTruthy())
    fireEvent.press(view.getByText("Lucario Hariyama"))
    fireEvent.press(view.getByLabelText("Preview Riolu"))

    await waitFor(() => expect(view.getByText("Pokemon · Basic · Fighting")).toBeTruthy())
    expect(view.getByTestId("card-focus-image")).toBeTruthy()
    expect(mockPokemonCardByReference).toHaveBeenCalledWith({
      name: "Riolu",
      originalReference: "MEG 76",
    })
    fireEvent.press(view.getByText("Close"))
    expect(view.getByTestId("catalog-card-thumbnail-catalog-card-riolu").props.source).toEqual([
      { uri: "https://assets.example/riolu/high.webp" },
    ])
    expect(mockPokemonCardByReference).toHaveBeenCalledTimes(1)
  })

  it("carries the chosen game, format, and note into a new deck", async () => {
    const view = renderAddDeck()
    chooseFormat(view, "modern")
    chooseMode(view, "blank")
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Scratch Deck")
    fireEvent.changeText(view.getByTestId("deck-note-input"), "Testing a new sideboard plan")
    fireEvent.press(view.getByText("Create deck"))
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        name: "Scratch Deck",
        format: "modern",
        game: "mtg",
        note: "Testing a new sideboard plan",
      }),
    )
  })

  it("resolves a full account inline without losing the new deck draft", async () => {
    atCapacity()
    const view = renderAddDeck()
    expect(view.queryByText("Your deck slots are full")).toBeNull()
    expect(view.queryByText(/Premium/)).toBeNull()
    chooseMode(view, "blank")
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Blocked Deck")
    fireEvent.press(view.getByText("Create deck"))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(view.getByText("Your deck slots are full")).toBeTruthy()
    expect(view.getByText("Create deck")).toBeDisabled()
    fireEvent.press(view.getByText("Choose a deck"))
    fireEvent.press(view.getByText("Archive Existing Deck"))
    fireEvent.press(view.getByText("Keep deck"))
    expect(mockArchive).not.toHaveBeenCalled()
    fireEvent.press(view.getByText("Archive Existing Deck"))
    fireEvent.press(view.getByText("Archive deck"))
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith({ deckId: "existing-deck" }))
    mockListMine.value = {
      ...readyShelf,
      capacity: { used: 1, limit: 2, premium: false, canCreate: true },
    }
    view.rerender(
      <ThemeProvider initialContext="light">
        <AddDeckScreen onBack={jest.fn()} onCreated={jest.fn()} />
      </ThemeProvider>,
    )
    expect(view.getByTestId("deck-name-input").props.value).toBe("Blocked Deck")
    expect(view.getByText("Create deck")).toBeEnabled()
  })

  it("keeps entered data while the deck limit is still loading", () => {
    mockListMine.value = undefined
    const view = renderAddDeck()
    chooseMode(view, "blank")
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Patient Deck")

    expect(view.getByText("Checking deck limit…")).toBeTruthy()
    expect(view.getByText("Create deck")).toBeDisabled()

    mockListMine.value = {
      decks: [],
      capacity: { used: 0, limit: 100, premium: true, canCreate: true },
      analyticsLocked: false,
    }
    view.rerender(
      <ThemeProvider initialContext="light">
        <AddDeckScreen onBack={jest.fn()} onCreated={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByTestId("deck-name-input").props.value).toBe("Patient Deck")
    expect(view.getByText("Create deck")).toBeEnabled()
  })

  it("retries a failed preview without losing the selected deck", async () => {
    mockPreviewPrecon.mockRejectedValueOnce(new Error("Preview service unavailable"))
    const view = renderAddDeck()
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => jest.advanceTimersByTime(400))
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())
    fireEvent.press(view.getByText("Explorers of the Deep"))

    await waitFor(() => expect(view.getByText("Could not load this deck")).toBeTruthy())
    expect(view.getByText("Explorers of the Deep")).toBeTruthy()
    fireEvent.press(view.getByTestId("retry-precon-preview"))

    await waitFor(() => expect(view.getByText("1× Hakbal of the Surging Soul")).toBeTruthy())
    expect(view.getByText("Explorers of the Deep")).toBeTruthy()
  })
})
