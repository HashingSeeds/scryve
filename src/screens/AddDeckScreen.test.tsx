import { Linking } from "react-native"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { saveCardDetails } from "@/features/decks/cardDetailsCache"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { cardDetailsKey } from "@/features/decks/deckCards"
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
      collectorNumber: "3",
      commanderEligibility: "eligible",
      colorIdentity: "GU",
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
const mockConvexClient = { action: jest.fn() }
const mockConvexState: { client: typeof mockConvexClient | undefined } = { client: undefined }
const mockResolvePasted = jest.fn()
const mockResolveArchidekt = jest.fn()
type MockCatalogDeck = {
  _id: string
  game: string
  name: string
  kind: string
  format?: string
}
const mockSearchTopDecks = jest.fn(async (_args: unknown): Promise<MockCatalogDeck[]> => [])
const mockBrowse = jest.fn(async (args: unknown) => ({
  decks: await mockSearchTopDecks(args),
  cursor: null as string | null,
  status: "ready",
  retryAfterMs: undefined as number | undefined,
}))
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
  useConvex: () => mockConvexState.client,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
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
    if (reference === "archidektImports.resolvePublic") return mockResolveArchidekt
    if (reference === "deckCatalogs.browse") return mockBrowse
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
    archidektImports: { resolvePublic: "archidektImports.resolvePublic" },
    deckImports: {
      searchPreconstructed: "deckImports.searchPreconstructed",
      previewPreconstructed: "deckImports.previewPreconstructed",
      resolvePreconstructed: "deckImports.resolvePreconstructed",
      resolvePasted: "deckImports.resolvePasted",
    },
    cards: {
      search: "cards.search",
      byId: "cards.byId",
      byCatalogId: "cards.byCatalogId",
      byPokemonReference: "cards.byPokemonReference",
    },
    deckCatalogs: {
      detail: "deckCatalogs.detail",
      browse: "deckCatalogs.browse",
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
    mockConvexState.client = undefined
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
          access={{
            ready,
            loading: false,
            signedIn: true,
            request,
            ownerId: ready ? "owner-a" : undefined,
          }}
        />
      </ThemeProvider>
    )
    const view = render(renderForm(false))
    act(() => jest.advanceTimersByTime(500))
    expect(mockSearch).toHaveBeenCalled()
    expect(mockSearchTopDecks).toHaveBeenCalled()
    expect(view.queryByTestId("deck-capacity-status")).toBeNull()
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "My draft")
    fireEvent.changeText(view.getByLabelText("Deck list"), "1 Sol Ring")
    fireEvent.press(view.getByText("Review deck list"))
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
    expect(view.getByText("One deck saved on this device")).toBeTruthy()
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

  it("saves a guest's pasted list locally without requesting sign-in", async () => {
    const request = jest.fn()
    const onCreated = jest.fn()
    mockResolvePasted.mockResolvedValueOnce({
      cards: [
        {
          name: "Forest",
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          quantity: 60,
          board: "main",
        },
      ],
      unresolved: [],
      invalidLines: [],
    })
    const view = render(
      <ThemeProvider initialContext="dark">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={onCreated}
          access={{ ready: false, loading: false, signedIn: false, request }}
        />
      </ThemeProvider>,
    )
    chooseFormat(view, "standard")
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Guest Forests")
    fireEvent.changeText(view.getByLabelText("Deck list"), "60 Forest")
    fireEvent.press(view.getByText("Review deck list"))
    await waitFor(() => expect(view.getByLabelText("60× Forest")).toBeTruthy())
    expect(loadGuestDeck()).toBeUndefined()
    expect(onCreated).not.toHaveBeenCalled()
    fireEvent.press(view.getByText("Save on device"))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("guest"))
    expect(loadGuestDeck()?.deck).toMatchObject({
      name: "Guest Forests",
      format: "standard",
      cards: [{ name: "Forest", quantity: 60 }],
    })
    expect(request).not.toHaveBeenCalled()
    expect(mockImport).not.toHaveBeenCalled()
  })

  const resolvedForest = {
    cards: [
      {
        name: "Forest",
        quantity: 2,
        board: "main",
        oracleId: "forest-oracle",
        scryfallId: "forest-print",
      },
    ],
    unresolved: [],
    invalidLines: [],
  }

  function enterPasted(view: ReturnType<typeof renderAddDeck>, list = "2 Forest") {
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Reviewed deck")
    fireEvent.changeText(view.getByLabelText("Deck list"), list)
    fireEvent.press(view.getByTestId("review-import-button"))
  }

  it("keeps a partial review for correction and requires explicit removal before saving", async () => {
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      unresolved: ["Island (M21) 265"],
      invalidLines: ["0 Mountain"],
    })
    const view = renderAddDeck()
    enterPasted(view, "2 Forest\n1 Island (M21) 265\n0 Mountain")
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    expect(view.getByText("Unmatched: Island (M21) 265")).toBeTruthy()
    expect(view.getByText("Not understood: 0 Mountain")).toBeTruthy()
    expect(view.getByTestId("save-import-button")).toBeDisabled()
    expect(mockImport).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("omit-import-problems"))
    expect(view.getByText(/2 unmatched or invalid lines removed/)).toBeTruthy()
    expect(view.queryByLabelText("Deck list")).toBeNull()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          cards: [expect.objectContaining({ name: "Forest", quantity: 2 })],
        }),
      ),
    )
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    expect(view.getByLabelText("Deck list").props.value).toBe(
      "2 Forest\n1 Island (M21) 265\n0 Mountain",
    )
  })

  it("removes unmatched generic cards while preserving a matched printing with the same name", async () => {
    const known = {
      game: "pokemon",
      name: "Pikachu",
      quantity: 2,
      section: "main",
      entryKind: "card",
      originalReference: "Pikachu SVI 63",
      cardId: "sv1-63",
    }
    const unmatched = {
      ...known,
      quantity: 1,
      originalReference: "Pikachu BAD 99",
      cardId: undefined,
    }
    mockResolvePasted.mockResolvedValueOnce({
      cards: [known, unmatched],
      unresolved: [unmatched.originalReference],
      invalidLines: [],
    })
    const view = renderAddDeck()
    chooseGame(view, "pokemon")
    const source = "2 Pikachu SVI 63\n1 Pikachu BAD 99"
    enterPasted(view, source)
    await waitFor(() => expect(view.getByLabelText("1× Pikachu")).toBeTruthy())
    expect(view.getByTestId("save-import-button")).toBeDisabled()
    fireEvent.press(view.getByTestId("omit-import-problems"))
    expect(view.queryByLabelText("1× Pikachu")).toBeNull()
    expect(view.getByLabelText("2× Pikachu")).toBeTruthy()
    expect(view.getByText(/ · 2 cards$/)).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({ cards: [expect.objectContaining(known)] }),
      ),
    )
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    expect(view.getByLabelText("Deck list").props.value).toBe(source)
  })

  it("preserves the resolved draft and edited text when a repair request fails", async () => {
    mockResolvePasted.mockResolvedValueOnce({ ...resolvedForest, unresolved: ["Forst"] })
    const view = renderAddDeck()
    enterPasted(view, "2 Forest\n1 Forst")
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    fireEvent.changeText(view.getByLabelText("Deck list"), "3 Forest")
    mockResolvePasted.mockRejectedValueOnce(new Error("Unavailable"))
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() =>
      expect(view.getByText("Could not resolve deck list. Try again.")).toBeTruthy(),
    )
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.getByLabelText("Deck list").props.value).toBe("3 Forest")
    expect(view.queryByTestId("save-import-button")).toBeNull()
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      cards: [{ ...resolvedForest.cards[0], quantity: 3 }],
    })
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByLabelText("3× Forest")).toBeTruthy())
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("replaces the form with review and restores its fields through Back without importing Build notes", async () => {
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    const view = renderAddDeck()
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-note-input"), "Keep these Build notes")
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    expect(view.getByText("Reviewed deck")).toBeTruthy()
    expect(view.getByText("Commander · 2 cards")).toBeTruthy()
    expect(view.queryByTestId("game-picker-options")).toBeNull()
    expect(view.queryByTestId("format-picker-options")).toBeNull()
    expect(view.queryByTestId("mode-picker-options")).toBeNull()
    expect(view.queryByTestId("deck-name-input")).toBeNull()
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.queryByTestId("save-import-button")).toBeNull()
    expect(view.getByTestId("deck-name-input").props.value).toBe("Reviewed deck")
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    expect(view.getByLabelText("Deck list").props.value).toBe("2 Forest")
    chooseFormat(view, "modern")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Edited deck")
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByText("Modern · 2 cards")).toBeTruthy())
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Edited deck",
          format: "modern",
        }),
      ),
    )
    expect(mockImport).not.toHaveBeenCalledWith(
      expect.objectContaining({ note: expect.anything() }),
    )
  })

  it.each(["", "   "])(
    "explains a missing name in review and restores editing for %p",
    async (blankName) => {
      mockResolvePasted.mockResolvedValue(resolvedForest)
      const view = renderAddDeck()
      chooseMode(view, "paste")
      fireEvent.changeText(view.getByTestId("deck-name-input"), blankName)
      fireEvent.changeText(view.getByLabelText("Deck list"), "2 Forest")
      fireEvent.press(view.getByTestId("review-import-button"))
      await waitFor(() => expect(view.getByText("Add a deck name.")).toBeTruthy())
      expect(view.getByText("Imported deck")).toBeTruthy()
      expect(view.getByTestId("save-import-button")).toBeDisabled()
      expect(mockImport).not.toHaveBeenCalled()
      fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
      expect(view.getByTestId("deck-name-input").props.value).toBe(blankName)
      fireEvent.changeText(view.getByTestId("deck-name-input"), "Named forests")
      fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
      await waitFor(() => expect(view.getByText("Named forests")).toBeTruthy())
      expect(view.queryByText("Add a deck name.")).toBeNull()
      expect(view.getByTestId("save-import-button")).toBeEnabled()
    },
  )

  it("keeps guest replacement recovery available from the review", async () => {
    const saved = saveGuestDeck({ name: "Keep me", game: "mtg", format: "commander", cards: [] })
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    const view = render(
      <ThemeProvider initialContext="dark">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={jest.fn()}
          access={{ ready: false, loading: false, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>,
    )
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByTestId("save-import-button"))
    expect(view.getByText("Replace saved deck…")).toBeTruthy()
    expect(view.getByTestId("save-import-button")).toBeDisabled()
    expect(loadGuestDeck()?.localId).toBe(saved.localId)
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    expect(view.getByLabelText("Deck list").props.value).toBe("2 Forest")
    expect(loadGuestDeck()?.localId).toBe(saved.localId)
  })

  it("shows loading on the review button until the deck is ready", async () => {
    let finish: ((result: typeof resolvedForest) => void) | undefined
    mockResolvePasted.mockImplementationOnce(
      () =>
        new Promise<typeof resolvedForest>((resolve) => {
          finish = resolve
        }),
    )
    const view = renderAddDeck()
    enterPasted(view)
    expect(view.getByText("Loading deck…")).toBeTruthy()
    expect(view.getByTestId("review-import-button")).toBeDisabled()
    expect(view.getByTestId("deck-name-input")).toBeTruthy()
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    await act(async () => finish?.(resolvedForest))
    expect(view.getByTestId("pasted-deck-review")).toBeTruthy()
    expect(view.queryByTestId("review-import-button")).toBeNull()
  })

  it("enters card editing from review without reopening the source form", async () => {
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    expect(view.getByTestId("pasted-deck-review")).toBeTruthy()
    expect(view.queryByLabelText("Deck list")).toBeNull()
    expect(view.getByLabelText("Increase Forest")).toBeTruthy()
    expect(view.getByLabelText("Decrease Forest")).toBeTruthy()
    expect(view.getByTestId("import-add-cards")).toBeTruthy()
    expect(view.getByLabelText("Choose commander")).toBeTruthy()
  })

  it.each(["modern", "brawl"])(
    "normalizes resolved commander rows for %s on initial review and source reload",
    async (format) => {
      const commander = { ...resolvedForest.cards[0], quantity: 1, board: "commander" }
      const resolved = { ...resolvedForest, cards: [...resolvedForest.cards, commander] }
      mockResolvePasted.mockResolvedValueOnce(resolved).mockResolvedValueOnce(resolved)
      const view = renderAddDeck()
      chooseFormat(view, format)
      enterPasted(view, "2 Forest\nCommander\n1 Forest")
      await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
      const expectSections = () => {
        if (format === "modern") {
          expect(view.queryByTestId("import-card-commander-0")).toBeNull()
          expect(view.getByLabelText("3× Forest")).toBeTruthy()
        } else {
          expect(view.getByTestId("import-card-commander-0")).toBeTruthy()
          expect(view.getByLabelText("2× Forest")).toBeTruthy()
          expect(view.getByLabelText("1× Forest")).toBeTruthy()
        }
      }
      expectSections()
      fireEvent.press(view.getByRole("button", { name: "common:back" }))
      fireEvent.press(view.getByTestId("review-import-button"))
      await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
      expectSections()
      fireEvent.press(view.getByTestId("save-import-button"))
      await waitFor(() =>
        expect(mockImport).toHaveBeenCalledWith(
          expect.objectContaining({
            format,
            cards:
              format === "modern"
                ? [expect.objectContaining({ quantity: 3, board: "main" })]
                : expect.arrayContaining([
                    expect.objectContaining({ quantity: 1, board: "commander" }),
                    expect.objectContaining({ quantity: 2, board: "main" }),
                  ]),
          }),
        ),
      )
    },
  )

  it("rejects source resolution when remapping commander copies would exceed 999", async () => {
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      cards: [
        { ...resolvedForest.cards[0], quantity: 999 },
        { ...resolvedForest.cards[0], quantity: 1, board: "commander" },
      ],
    })
    const view = renderAddDeck()
    chooseFormat(view, "modern")
    const source = "999 Forest\nCommander\n1 Forest"
    enterPasted(view, source)
    await waitFor(() =>
      expect(
        view.getByText(
          "Forest has more than 999 copies after matching. Correct the source before reviewing.",
        ),
      ).toBeTruthy(),
    )
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.getByLabelText("Deck list").props.value).toBe(source)
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("replaces the imported commander through its chooser and saves the chosen color without changing printings or totals", async () => {
    const old = {
      ...resolvedForest.cards[0],
      name: "Old commander",
      quantity: 1,
      board: "commander",
    }
    const piper = {
      name: "The Prismatic Piper",
      quantity: 2,
      board: "main",
      oracleId: "piper-oracle",
      scryfallId: "owned-piper",
    }
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      cards: [old, { ...old, quantity: 2, board: "main" }, piper],
    })
    saveCardDetails({
      "forest-print": {
        commanderEligibility: "eligible",
        commanderLegality: "legal",
        colorIdentity: "R",
      },
      "owned-piper": {
        commanderEligibility: "color-choice",
        commanderLegality: "legal",
        colorIdentity: "",
        commanderRulesUpdatedAt: new Date().toISOString(),
      },
    })
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    expect(view.queryByText("Another copy of this commander remains in the deck.")).toBeNull()
    expect(
      view.queryByText(
        "Some card details are missing. Deck color identity has not been fully checked.",
      ),
    ).toBeNull()
    fireEvent.press(view.getByRole("button", { name: "Edit" }))
    expect(view.getByText("5 cards")).toBeTruthy()
    expect(view.queryByText("Commander · 5 cards")).toBeNull()
    fireEvent.press(view.getByLabelText("Change commander"))
    expect(view.UNSAFE_getByType(CardSearchScreen).props.initialSection).toBe("commander")
    fireEvent.press(view.getByLabelText("Preview The Prismatic Piper as commander"))
    await waitFor(() => expect(view.getByTestId("commander-color")).toBeTruthy())
    expect(view.getByTestId("set-commander")).toBeDisabled()
    fireEvent.press(view.getByTestId("commander-color"))
    fireEvent.press(view.getByTestId("commander-color-option-G"))
    fireEvent.press(view.getByTestId("set-commander"))
    expect(view.queryByTestId("card-search-input")).toBeNull()
    expect(view.getByText("5 cards")).toBeTruthy()
    expect(view.getByText("Another copy of this commander remains in the deck.")).toBeTruthy()
    expect(view.getByText("Outside this commander's color identity: Old commander.")).toBeTruthy()
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    expect(view.getByLabelText("3× Old commander")).toBeTruthy()
    expect(view.getAllByLabelText("1× The Prismatic Piper")).toHaveLength(2)
    fireEvent.press(view.getByRole("button", { name: "Done" }))
    expect(view.getByText("Commander · 5 cards")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({ name: "Old commander", quantity: 3, section: "main" }),
            expect.objectContaining({ scryfallId: "owned-piper", quantity: 1, section: "main" }),
            expect.objectContaining({
              scryfallId: "owned-piper",
              quantity: 1,
              section: "commander",
              commanderColor: "G",
            }),
          ]),
        }),
      ),
    )
  })

  it("keeps entry and copy limits when adding cards through the import editor", async () => {
    const cards = Array.from({ length: 300 }, (_, index) => ({
      ...resolvedForest.cards[0],
      name: `Card ${index}`,
      quantity: index === 0 ? 999 : 1,
      scryfallId: `print-${index}`,
      oracleId: `oracle-${index}`,
    }))
    mockResolvePasted.mockResolvedValueOnce({ ...resolvedForest, cards })
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: "Edit" }))
    fireEvent.press(view.getByTestId("import-add-cards"))
    const add = view.UNSAFE_getByType(CardSearchScreen).props.onAdd
    act(() => {
      expect(add({ ...cards[0], quantity: 1 })).toBe("A card can have at most 999 copies.")
      expect(
        add({ ...cards[0], name: "Another printing", quantity: 1, scryfallId: "new-print" }),
      ).toBe("A deck can have at most 300 entries.")
    })
    fireEvent.press(
      within(view.UNSAFE_getByType(CardSearchScreen)).getByRole("button", { name: "Done" }),
    )
    expect(view.getByText("1298 cards")).toBeTruthy()
  })

  async function editColorCommander(quantity: number) {
    const card = { ...resolvedForest.cards[0], board: "main" as const, quantity }
    mockResolvePasted.mockResolvedValueOnce({ ...resolvedForest, cards: [card] })
    saveCardDetails({
      [cardDetailsKey(card, "mtg")]: {
        commanderEligibility: "color-choice",
        commanderLegality: "legal",
        colorIdentity: "",
      },
    })
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    fireEvent.press(view.getByTestId("import-add-cards"))
    act(() => {
      expect(
        view.UNSAFE_getByType(CardSearchScreen).props.onAdd({
          ...card,
          quantity: 1,
          section: "commander",
          board: "commander",
          commanderColor: "U",
        }),
      ).toBeUndefined()
    })
    fireEvent.press(
      within(view.UNSAFE_getByType(CardSearchScreen)).getByRole("button", { name: "Done" }),
    )
    return view
  }

  it("moves unsupported commanders to main and merges the same printing when changing format", async () => {
    const view = await editColorCommander(4)
    chooseFormat(view, "modern")
    expect(view.getByText("4 cards")).toBeTruthy()
    expect(view.queryByTestId("import-card-commander-0")).toBeNull()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "modern",
          cards: [expect.objectContaining({ quantity: 4, section: "main", board: "main" })],
        }),
      ),
    )
    expect(mockImport).not.toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ commanderColor: expect.anything() }),
        ]),
      }),
    )
  })

  it("preserves commanders and their chosen color in formats with a commander section", async () => {
    const view = await editColorCommander(4)
    chooseFormat(view, "brawl")
    expect(view.getByTestId("import-card-commander-0")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "brawl",
          cards: expect.arrayContaining([
            expect.objectContaining({ quantity: 1, section: "commander", commanderColor: "U" }),
          ]),
        }),
      ),
    )
  })

  it("keeps the format and every card when moving a commander would exceed 999 copies", async () => {
    const view = await editColorCommander(999)
    fireEvent.press(view.getAllByLabelText("Increase Forest")[1])
    chooseFormat(view, "modern")
    expect(
      view.getByText("Forest would exceed 999 copies. Reduce its quantity before changing format."),
    ).toBeTruthy()
    expect(view.getByText("1000 cards")).toBeTruthy()
    expect(view.getByTestId("import-card-commander-0")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "commander",
          cards: expect.arrayContaining([
            expect.objectContaining({ quantity: 999, section: "main" }),
            expect.objectContaining({ quantity: 1, section: "commander", commanderColor: "U" }),
          ]),
        }),
      ),
    )
  })

  it("keeps quantity changes, removals, and searched additions in the unsaved import", async () => {
    const first = {
      ...resolvedForest.cards[0],
      name: "Island",
      smallImageUrl: "https://assets.example/island.jpg",
    }
    const second = { ...first, quantity: 1, scryfallId: "other-island-print" }
    const solRing = {
      name: "Sol Ring",
      oracleId: "ring-oracle",
      scryfallId: "ring-print",
      smallImageUrl: "https://assets.example/ring.jpg",
      typeLine: "Artifact",
    }
    mockResolvePasted.mockResolvedValueOnce({
      cards: [first, second],
      unresolved: [],
      invalidLines: [],
    })
    mockConvexState.client = mockConvexClient
    mockConvexClient.action.mockImplementation(async (reference: string) =>
      reference === "cards.search" ? [solRing] : { urls: [] },
    )
    const view = renderAddDeck()
    enterPasted(view, "2 Island (M21) 265\n1 Island (DMU) 278")
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    fireEvent.press(view.getAllByLabelText("Increase Island")[0])
    expect(view.getByText("4 cards")).toBeTruthy()
    fireEvent.press(view.getAllByLabelText("Decrease Island")[0])
    fireEvent.press(view.getByLabelText("Remove Island"))
    expect(view.getByText("2 cards")).toBeTruthy()
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Edited islands")
    chooseFormat(view, "modern")
    fireEvent.press(view.getByTestId("import-add-cards"))
    fireEvent.changeText(view.getByTestId("card-search-input"), "Sol Ring")
    await act(async () => jest.advanceTimersByTime(400))
    await waitFor(() => expect(view.getByLabelText("Add Sol Ring to deck")).toBeTruthy())
    expect(mockConvexClient.action).toHaveBeenCalledWith("cards.search", {
      game: "mtg",
      query: "Sol Ring",
    })
    fireEvent.press(view.getByLabelText("Add Sol Ring to deck"))
    fireEvent.press(view.getByLabelText("Add Sol Ring to deck"))
    fireEvent.press(
      within(view.UNSAFE_getByType(CardSearchScreen)).getByRole("button", { name: "Done" }),
    )
    expect(mockImport).not.toHaveBeenCalled()
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    expect(view.getByLabelText("2× Island")).toBeTruthy()
    expect(view.queryByLabelText("1× Island")).toBeNull()
    expect(view.getByLabelText("2× Sol Ring")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    expect(view.getByLabelText("Deck list").props.value).toBe(
      "2 Island (M21) 265\n1 Island (DMU) 278",
    )
    fireEvent.press(view.getByTestId("return-import-review-button"))
    expect(view.getByLabelText("2× Sol Ring")).toBeTruthy()
    expect(mockResolvePasted).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Edited islands",
          format: "modern",
          cards: [
            expect.objectContaining({ scryfallId: first.scryfallId, quantity: 2 }),
            expect.objectContaining({
              scryfallId: solRing.scryfallId,
              quantity: 2,
              section: "main",
            }),
          ],
        }),
      ),
    )
  })

  it("blocks card and metadata editing while the reviewed import is saving", async () => {
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    let finishSave: ((id: string) => void) | undefined
    mockImport.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishSave = resolve
        }),
    )
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    fireEvent.press(view.getByTestId("save-import-button"))
    expect(view.getByLabelText("Increase Forest")).toBeDisabled()
    expect(view.getByLabelText("Decrease Forest")).toBeDisabled()
    expect(view.getByTestId("import-add-cards")).toBeDisabled()
    expect(view.getByLabelText("Choose commander")).toBeDisabled()
    expect(view.getByRole("button", { name: "Done" })).toBeDisabled()
    expect(view.getByRole("button", { name: "common:back" })).toBeDisabled()
    expect(view.getByTestId("deck-name-input").props.editable).toBe(false)
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Late edit")
    expect(view.getByTestId("deck-name-input").props.value).toBe("Reviewed deck")
    await act(async () => finishSave?.("deck-imported"))
  })

  it("keeps copy limits in the card editor and card focus dialog", async () => {
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      cards: [{ ...resolvedForest.cards[0], quantity: 999 }],
    })
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    expect(view.getByLabelText("Increase Forest")).toBeDisabled()
    fireEvent.press(view.getByTestId("import-card-main-0"))
    await waitFor(() => expect(view.getByTestId("card-focus-dialog")).toBeTruthy())
    expect(view.queryByTestId("card-focus-increment")).toBeNull()
    expect(view.getByTestId("card-focus-decrement")).toBeTruthy()
  })

  it("prevents returning to and editing an old draft while its source is reloading", async () => {
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    let finish: ((result: typeof resolvedForest) => void) | undefined
    mockResolvePasted.mockImplementationOnce(
      () =>
        new Promise<typeof resolvedForest>((resolve) => {
          finish = resolve
        }),
    )
    fireEvent.press(view.getByTestId("review-import-button"))
    expect(view.getByTestId("return-import-review-button")).toBeDisabled()
    fireEvent.press(view.getByTestId("return-import-review-button"))
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    await act(async () =>
      finish?.({ ...resolvedForest, cards: [{ ...resolvedForest.cards[0], quantity: 3 }] }),
    )
    expect(view.getByLabelText("3× Forest")).toBeTruthy()
  })

  it.each(["name", "format"])("refreshes guest replacement after editing %s", async (field) => {
    saveGuestDeck({ name: "Original guest", game: "mtg", format: "commander", cards: [] })
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    const view = render(
      <ThemeProvider initialContext="dark">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={jest.fn()}
          access={{ ready: false, loading: false, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>,
    )
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    fireEvent.press(view.getByTestId("save-import-button"))
    expect(view.getByText("Replace saved deck…")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    if (field === "name") fireEvent.changeText(view.getByTestId("deck-name-input"), "Fresh name")
    else chooseFormat(view, "modern")
    expect(view.queryByText("Replace saved deck…")).toBeNull()
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    fireEvent.press(view.getByTestId("save-import-button"))
    fireEvent.press(view.getByText("Replace saved deck…"))
    fireEvent.press(view.getByTestId("confirm-guest-replace-action"))
    expect(loadGuestDeck()?.deck).toMatchObject({
      name: field === "name" ? "Fresh name" : "Reviewed deck",
      format: field === "format" ? "modern" : "commander",
    })
  })

  it("merges matching aliases while keeping sections and printings distinct", async () => {
    const forest = resolvedForest.cards[0]
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      cards: [
        { ...forest, quantity: 1 },
        { ...forest, quantity: 2 },
        { ...forest, quantity: 1, board: "sideboard" },
        { ...forest, quantity: 1, scryfallId: "other-print" },
      ],
    })
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByLabelText("3× Forest")).toBeTruthy())
    expect(view.getByText("Commander · 5 cards")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    fireEvent.press(view.getAllByLabelText("Increase Forest")[0])
    expect(view.getByText("6 cards")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          cards: [
            expect.objectContaining({ scryfallId: forest.scryfallId, board: "main", quantity: 4 }),
            expect.objectContaining({
              scryfallId: forest.scryfallId,
              board: "sideboard",
              quantity: 1,
            }),
            expect.objectContaining({ scryfallId: "other-print", board: "main", quantity: 1 }),
          ],
        }),
      ),
    )
  })

  it("explains aliases exceeding the copy limit without clamping the import", async () => {
    const forest = resolvedForest.cards[0]
    mockResolvePasted.mockResolvedValueOnce({
      ...resolvedForest,
      cards: [
        { ...forest, quantity: 999 },
        { ...forest, quantity: 2 },
      ],
    })
    const view = renderAddDeck()
    enterPasted(view, "999 Forest\n2 Forest (M21) 274")
    await waitFor(() =>
      expect(
        view.getByText(
          "Forest has more than 999 copies after matching. Correct the source before reviewing.",
        ),
      ).toBeTruthy(),
    )
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.getByLabelText("Deck list").props.value).toBe("999 Forest\n2 Forest (M21) 274")
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("shows review thumbnails and loads only the tapped Magic printing", async () => {
    const firstId = "33333333-3333-3333-3333-333333333333"
    const secondId = "44444444-4444-4444-4444-444444444444"
    const first = {
      ...resolvedForest.cards[0],
      name: "Island",
      scryfallId: firstId,
      smallImageUrl: "https://assets.example/island-one.jpg",
    }
    const second = {
      ...first,
      quantity: 1,
      scryfallId: secondId,
      smallImageUrl: "https://assets.example/island-two.jpg",
    }
    mockResolvePasted.mockResolvedValue({
      cards: [first, second],
      unresolved: [],
      invalidLines: [],
    })
    const view = renderAddDeck()
    enterPasted(view, "2 Island (M21) 265\n1 Island (DMU) 278")
    await waitFor(() => expect(view.getByTestId("import-card-thumbnail-main-0")).toBeTruthy())
    expect(view.getByTestId("import-card-thumbnail-main-0").props.source).toEqual([
      { uri: first.smallImageUrl },
    ])
    expect(view.getByTestId("import-card-thumbnail-main-1").props.source).toEqual([
      { uri: second.smallImageUrl },
    ])
    expect(mockCardById).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("import-card-main-1"))
    await waitFor(() => expect(view.getByTestId("card-focus-dialog")).toBeTruthy())
    expect(mockCardById).toHaveBeenCalledWith({ scryfallId: secondId })
    expect(mockCardById).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByText("Close"))
    fireEvent.press(view.getByTestId("import-card-main-0"))
    await waitFor(() => expect(mockCardById).toHaveBeenCalledWith({ scryfallId: firstId }))
    fireEvent.press(view.getByText("Close"))
    fireEvent.press(view.getByTestId("import-card-main-1"))
    await waitFor(() => expect(view.getByTestId("card-focus-dialog")).toBeTruthy())
    expect(mockCardById).toHaveBeenCalledTimes(2)
    expect(mockImport).not.toHaveBeenCalled()
    fireEvent.press(view.getByRole("button", { name: "common:back", includeHiddenElements: true }))
    expect(view.queryByTestId("card-focus-dialog")).toBeNull()
    expect(view.getByLabelText("Deck list").props.value).toBe(
      "2 Island (M21) 265\n1 Island (DMU) 278",
    )
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
    expect(view.queryByTestId("card-focus-dialog")).toBeNull()
  })

  it("routes a reviewed Yu-Gi-Oh card to catalog details", async () => {
    mockResolvePasted.mockResolvedValueOnce({
      cards: [
        {
          game: "ygo",
          cardId: "14558127",
          name: "Ash Blossom & Joyous Spring",
          quantity: 3,
          section: "main",
          entryKind: "card",
          originalReference: "14558127",
          smallImageUrl: "https://assets.example/ash.jpg",
        },
      ],
      unresolved: [],
      invalidLines: [],
    })
    const view = renderAddDeck()
    chooseGame(view, "ygo")
    enterPasted(view, "3 Ash Blossom & Joyous Spring")
    await waitFor(() => expect(view.getByTestId("import-card-main-0")).toBeTruthy())
    expect(mockCatalogCardById).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("import-card-main-0"))
    await waitFor(() => expect(view.getByText("Effect Monster")).toBeTruthy())
    expect(mockCatalogCardById).toHaveBeenCalledWith({ game: "ygo", cardId: "14558127" })
    expect(mockCardById).not.toHaveBeenCalled()
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("loads reviewed Pokemon details from its original reference and updates its thumbnail", async () => {
    mockResolvePasted.mockResolvedValueOnce({
      cards: [
        {
          game: "pokemon",
          name: "Riolu",
          quantity: 3,
          section: "main",
          entryKind: "card",
          originalReference: "MEG 76",
        },
      ],
      unresolved: [],
      invalidLines: [],
    })
    const view = renderAddDeck()
    chooseGame(view, "pokemon")
    enterPasted(view, "3 Riolu MEG 76")
    await waitFor(() => expect(view.getByTestId("import-card-main-0")).toBeTruthy())
    expect(mockPokemonCardByReference).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("import-card-main-0"))
    await waitFor(() => expect(view.getByText("Pokemon · Basic · Fighting")).toBeTruthy())
    expect(mockPokemonCardByReference).toHaveBeenCalledWith({
      name: "Riolu",
      originalReference: "MEG 76",
    })
    fireEvent.press(view.getByText("Close"))
    expect(view.getByTestId("import-card-thumbnail-main-0").props.source).toEqual([
      { uri: "https://assets.example/riolu/high.webp" },
    ])
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("retries card detail failures without discarding the reviewed import", async () => {
    mockResolvePasted.mockResolvedValueOnce(resolvedForest)
    mockCardById.mockRejectedValueOnce(new Error("Unavailable"))
    const view = renderAddDeck()
    enterPasted(view)
    await waitFor(() => expect(view.getByTestId("import-card-main-0")).toBeTruthy())
    fireEvent.press(view.getByTestId("import-card-main-0"))
    await waitFor(() => expect(view.getByText("Could not load card details")).toBeTruthy())
    fireEvent.press(view.getByTestId("retry-card-details"))
    await waitFor(() => expect(view.getByText("Explore twice.")).toBeTruthy())
    expect(mockCardById).toHaveBeenCalledTimes(2)
    fireEvent.press(view.getByText("Close"))
    expect(view.getByLabelText("2× Forest")).toBeTruthy()
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    expect(mockImport).not.toHaveBeenCalled()
  })

  it.each(["input", "format", "game"])(
    "ignores a resolution completed after changing %s",
    async (change) => {
      let finish: ((result: typeof resolvedForest) => void) | undefined
      mockResolvePasted.mockImplementationOnce(
        () =>
          new Promise<typeof resolvedForest>((resolve) => {
            finish = resolve
          }),
      )
      const view = renderAddDeck()
      enterPasted(view)
      if (change === "input") fireEvent.changeText(view.getByLabelText("Deck list"), "3 Forest")
      else if (change === "format") chooseFormat(view, "modern")
      else chooseGame(view, "ygo")
      await act(async () => finish?.(resolvedForest))
      expect(view.queryByTestId("pasted-deck-review")).toBeNull()
      expect(mockImport).not.toHaveBeenCalled()
      if (change === "input") expect(view.getByLabelText("Deck list").props.value).toBe("3 Forest")
    },
  )

  const resolvedArchidekt = {
    ...resolvedForest,
    name: "Public Forests",
    format: "modern",
    sourceUrl: "https://archidekt.com/decks/12345",
    author: "ForestPlayer",
  }

  function enterLink(view: ReturnType<typeof renderAddDeck>) {
    chooseMode(view, "paste")
    fireEvent.press(view.getByTestId("import-source-link"))
    fireEvent.changeText(view.getByTestId("archidekt-url-input"), resolvedArchidekt.sourceUrl)
    fireEvent.press(view.getByTestId("review-import-button"))
  }

  it.each(["account", "guest"])(
    "edits an Archidekt draft before saving with attribution for %s",
    async (owner) => {
      mockResolveArchidekt.mockResolvedValue(resolvedArchidekt)
      const onCreated = jest.fn()
      const request = jest.fn()
      const view =
        owner === "account"
          ? renderAddDeck(onCreated)
          : render(
              <ThemeProvider initialContext="dark">
                <AddDeckScreen
                  onBack={jest.fn()}
                  onCreated={onCreated}
                  access={{ ready: false, loading: false, signedIn: false, request }}
                />
              </ThemeProvider>,
            )
      enterLink(view)
      await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
      expect(view.getByText("Public Forests")).toBeTruthy()
      expect(view.getByText("Modern · 2 cards")).toBeTruthy()
      expect(view.queryByTestId("deck-name-input")).toBeNull()
      expect(view.queryByTestId("archidekt-url-input")).toBeNull()
      expect(view.queryByTestId("mode-picker-options")).toBeNull()
      expect(view.queryByTestId("format-picker-options")).toBeNull()
      expect(view.getByText("Archidekt · ForestPlayer")).toBeTruthy()
      expect(mockResolveArchidekt).toHaveBeenCalledWith({ url: resolvedArchidekt.sourceUrl })
      expect(mockResolvePasted).not.toHaveBeenCalled()
      expect(mockImport).not.toHaveBeenCalled()
      expect(loadGuestDeck()).toBeUndefined()
      const openSource = jest.spyOn(Linking, "openURL").mockResolvedValueOnce(undefined)
      fireEvent.press(view.getByLabelText("View on Archidekt by ForestPlayer"))
      expect(openSource).toHaveBeenCalledWith(resolvedArchidekt.sourceUrl)
      openSource.mockRestore()
      fireEvent.press(view.getByRole("button", { name: "Edit" }))
      expect(view.getByTestId("pasted-deck-review")).toBeTruthy()
      expect(view.queryByTestId("archidekt-url-input")).toBeNull()
      fireEvent.press(view.getByLabelText("Decrease Forest"))
      expect(view.getByTestId("save-import-button")).toBeEnabled()
      fireEvent.press(view.getByTestId("save-import-button"))
      await waitFor(() =>
        expect(onCreated).toHaveBeenCalledWith(owner === "account" ? "deck-imported" : "guest"),
      )
      const expectedDeck = {
        name: "Public Forests",
        format: "modern",
        game: "mtg",
        note: "Imported from Archidekt by ForestPlayer\nhttps://archidekt.com/decks/12345",
        cards: [expect.objectContaining({ name: "Forest", quantity: 1 })],
      }
      if (owner === "account")
        expect(mockImport).toHaveBeenCalledWith(expect.objectContaining(expectedDeck))
      else expect(loadGuestDeck()?.deck).toMatchObject(expectedDeck)
      expect(request).not.toHaveBeenCalled()
    },
  )

  it("keeps a player's chosen format when reviewing the same Archidekt link again", async () => {
    mockResolveArchidekt.mockResolvedValue(resolvedArchidekt)
    const view = renderAddDeck()
    enterLink(view)
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    expect(view.getByText("Modern · 2 cards")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    chooseFormat(view, "standard")
    expect(view.queryByTestId("save-import-button")).toBeNull()
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByTestId("save-import-button")).toBeEnabled())
    expect(view.getByText("Standard · 2 cards")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(expect.objectContaining({ format: "standard" })),
    )
  })

  it("keeps reloaded Archidekt commanders in main after editing to Modern", async () => {
    mockResolveArchidekt.mockResolvedValue({
      ...resolvedArchidekt,
      format: "commander",
      cards: [
        ...resolvedForest.cards,
        { ...resolvedForest.cards[0], quantity: 1, board: "commander" },
      ],
    })
    const view = renderAddDeck()
    enterLink(view)
    await waitFor(() => expect(view.getByTestId("import-card-commander-0")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: "Edit" }))
    chooseFormat(view, "modern")
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(mockResolveArchidekt).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.getByTestId("save-import-button")).toBeEnabled())
    expect(view.getByText("Modern · 3 cards")).toBeTruthy()
    expect(view.getByLabelText("3× Forest")).toBeTruthy()
    expect(view.queryByTestId("import-card-commander-0")).toBeNull()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "modern",
          cards: [
            expect.objectContaining({ quantity: 3, board: "main", scryfallId: "forest-print" }),
          ],
        }),
      ),
    )
  })

  it.each(["url", "format", "kind", "game"])(
    "ignores Archidekt results after changing %s",
    async (change) => {
      let finish: ((result: typeof resolvedArchidekt) => void) | undefined
      mockResolveArchidekt.mockImplementationOnce(
        () =>
          new Promise<typeof resolvedArchidekt>((resolve) => {
            finish = resolve
          }),
      )
      const view = renderAddDeck()
      enterLink(view)
      if (change === "url")
        fireEvent.changeText(
          view.getByTestId("archidekt-url-input"),
          "https://archidekt.com/decks/67890",
        )
      else if (change === "format") chooseFormat(view, "standard")
      else if (change === "kind") fireEvent.press(view.getByTestId("import-source-text"))
      else chooseGame(view, "ygo")
      await act(async () => finish?.(resolvedArchidekt))
      expect(view.queryByTestId("pasted-deck-review")).toBeNull()
      expect(view.queryByText("Archidekt · ForestPlayer")).toBeNull()
      expect(view.getByTestId("mode-picker-options")).toBeTruthy()
      expect(view.queryByTestId("save-import-button")).toBeNull()
      expect(mockImport).not.toHaveBeenCalled()
    },
  )

  it("keeps a failed Archidekt URL and offers a text export fallback", async () => {
    mockResolveArchidekt.mockRejectedValueOnce(
      new ConvexError({ message: "Use a public Archidekt deck or paste its text export." }),
    )
    const view = renderAddDeck()
    enterLink(view)
    await waitFor(() =>
      expect(view.getByText("Use a public Archidekt deck or paste its text export.")).toBeTruthy(),
    )
    expect(view.getByTestId("archidekt-url-input").props.value).toBe(resolvedArchidekt.sourceUrl)
    fireEvent.press(view.getByText("Paste text instead"))
    expect(view.getByLabelText("Deck list")).toBeTruthy()
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("returns to the same edited Archidekt draft after changing source", async () => {
    mockResolveArchidekt.mockResolvedValue(resolvedArchidekt)
    const view = renderAddDeck()
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "My forests")
    enterLink(view)
    await waitFor(() => expect(view.getByText("My forests")).toBeTruthy())
    expect(view.getByText("Modern · 2 cards")).toBeTruthy()
    expect(view.queryByTestId("game-picker-options")).toBeNull()
    expect(view.queryByTestId("archidekt-url-input")).toBeNull()
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    fireEvent.press(view.getByRole("button", { name: "Edit" }))
    fireEvent.press(view.getByLabelText("Increase Forest"))
    fireEvent.press(view.getByRole("button", { name: "common:back" }))
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.queryByTestId("save-import-button")).toBeNull()
    expect(view.getByTestId("archidekt-url-input").props.value).toBe(resolvedArchidekt.sourceUrl)
    expect(view.getByTestId("deck-name-input").props.value).toBe("My forests")
    expect(view.getByTestId("format-picker-options").props.accessibilityLabel).toBe(
      "Format, Modern",
    )
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Edited forests")
    fireEvent.press(view.getByTestId("return-import-review-button"))
    await waitFor(() => expect(view.getByText("Edited forests")).toBeTruthy())
    expect(view.getByLabelText("3× Forest")).toBeTruthy()
    expect(mockResolveArchidekt).toHaveBeenCalledTimes(1)
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    expect(mockImport).not.toHaveBeenCalled()
  })

  it("keeps Archidekt attribution separate from existing Build notes", async () => {
    mockResolveArchidekt.mockResolvedValue(resolvedArchidekt)
    const view = renderAddDeck()
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-note-input"), "x".repeat(1000))
    enterLink(view)
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith(
        expect.objectContaining({
          note: "Imported from Archidekt by ForestPlayer\nhttps://archidekt.com/decks/12345",
        }),
      ),
    )
  })

  it("shows Magic examples and official decks together with source labels", async () => {
    mockSearchTopDecks.mockResolvedValueOnce([
      { _id: "example", game: "mtg", name: "Modern example", kind: "example", format: "modern" },
    ])
    const view = renderAddDeck()
    chooseFormat(view, "modern")
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockSearchTopDecks).toHaveBeenLastCalledWith({
      source: "all",
      game: "mtg",
      format: "modern",
      query: "",
    })
    expect(mockSearch).toHaveBeenLastCalledWith({ format: "modern", query: "" })
    expect(view.getByText("Modern example")).toBeTruthy()
    expect(view.getByText("Example deck")).toBeTruthy()
    expect(view.getByText("Explorers of the Deep")).toBeTruthy()
    expect(view.getByText("Wizards · Commander Deck · LCC")).toBeTruthy()
    expect(view.queryByLabelText("Deck source")).toBeNull()
  })

  it.each(["catalog", "official"])(
    "keeps the other source visible when %s search fails",
    async (source) => {
      if (source === "catalog") mockBrowse.mockRejectedValueOnce(new Error("Catalog unavailable"))
      else {
        mockSearch.mockRejectedValueOnce(new Error("Official unavailable"))
        mockSearchTopDecks.mockResolvedValueOnce([
          { _id: "example", game: "mtg", name: "Modern example", kind: "example" },
        ])
      }
      const view = renderAddDeck()
      await act(async () => jest.advanceTimersByTime(400))
      expect(
        view.getByText(source === "catalog" ? "Explorers of the Deep" : "Modern example"),
      ).toBeTruthy()
      expect(view.getByText("Retry")).toBeTruthy()
    },
  )

  it("keeps deck previews available during refresh limits and loads the next page", async () => {
    mockBrowse
      .mockResolvedValueOnce({
        decks: [
          {
            _id: "cached",
            game: "ygo",
            name: "Cached deck",
            kind: "tournament",
            format: "advanced",
          },
        ],
        cursor: "next-page",
        status: "rate_limited",
        retryAfterMs: 5000,
      })
      .mockResolvedValueOnce({
        decks: [
          { _id: "next", game: "ygo", name: "Next deck", kind: "tournament", format: "advanced" },
        ],
        cursor: null,
        status: "ready",
        retryAfterMs: undefined,
      })
    const view = renderAddDeck()
    chooseGame(view, "ygo")
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByText("Cached deck")).toBeTruthy()
    expect(view.getByText(/Refresh available in 5 seconds/)).toBeTruthy()
    fireEvent.press(view.getByText("Load more"))
    await waitFor(() => expect(view.getByText("Next deck")).toBeTruthy())
    expect(view.getByText("Cached deck")).toBeTruthy()
    expect(mockBrowse).toHaveBeenLastCalledWith({
      source: "all",
      game: "ygo",
      format: "advanced",
      query: "",
      cursor: "next-page",
    })
    fireEvent.press(view.getByText("Cached deck"))
    expect(view.getByTestId("catalog-deck-preview")).toBeTruthy()
  })

  it.each(["ygo", "pokemon"])("browses all %s sources without requiring sign-in", async (game) => {
    const view = renderAddDeck()
    chooseGame(view, game)
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockBrowse).toHaveBeenLastCalledWith({
      game,
      format: game === "ygo" ? "advanced" : "standard",
      query: "",
      source: "all",
    })
    expect(view.getByPlaceholderText("Search decks")).toBeTruthy()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("offers official, pasted, and scratch-built creation paths", () => {
    const view = renderAddDeck()
    expect(view.getByPlaceholderText("Search decks")).toBeTruthy()
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
    expect(view.getByText("One deck saved on this device")).toBeTruthy()
    expect(view.getByText("Create deck")).toBeDisabled()

    fireEvent.press(view.getByText("Replace saved deck…"))
    expect(view.getByTestId("confirm-guest-replace")).toBeTruthy()
    fireEvent.press(view.getByTestId("cancel-guest-replace"))
    expect(onCreated).not.toHaveBeenCalled()

    fireEvent.press(view.getByText("Replace saved deck…"))
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

  it("offers paste and empty deck actions for a format with no lists", async () => {
    mockSearch.mockResolvedValueOnce([])
    const view = renderAddDeck()
    chooseFormat(view, "standard")
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockSearchTopDecks).toHaveBeenCalledWith({
      source: "all",
      game: "mtg",
      query: "",
      format: "standard",
    })
    expect(view.getByText("No decks here yet")).toBeTruthy()
    fireEvent.press(view.getByText("Start empty"))
    expect(view.getByTestId("deck-name-input")).toBeTruthy()
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
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: [
          {
            name: "Hakbal of the Surging Soul",
            quantity: 1,
            oracleId: "11111111-1111-1111-1111-111111111111",
            scryfallId: "22222222-2222-2222-2222-222222222222",
            board: "commander",
            imageUrl: undefined,
            smallImageUrl: undefined,
          },
        ],
      }),
    )
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

  it("loads descriptions in a signed-out card preview", async () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <AddDeckScreen
          onBack={jest.fn()}
          onCreated={jest.fn()}
          access={{ ready: false, loading: false, signedIn: false, request: jest.fn() }}
        />
      </ThemeProvider>,
    )
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
      source: "all",
      game: "ygo",
      format: "advanced",
      query: "",
    })

    chooseFormat(view, "traditional")
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockSearchTopDecks).toHaveBeenLastCalledWith({
      source: "all",
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
      source: "all",
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

  it("counts down a Scryfall cooldown and retries while keeping the outline", async () => {
    mockResolvePrecon.mockRejectedValueOnce(
      new ConvexError({
        code: "scryfall_rate_limited",
        message: "Scryfall requests are paused. Try again shortly.",
        retryAfterMs: 3000,
      }),
    )
    const view = renderAddDeck()
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => jest.advanceTimersByTime(400))
    fireEvent.press(view.getByText("Explorers of the Deep"))
    await waitFor(() => expect(view.getByText("Retrying in 3s")).toBeTruthy())
    expect(view.getByTestId("retry-precon-preview")).toBeDisabled()
    expect(view.getByText("1× Hakbal of the Surging Soul")).toBeTruthy()
    fireEvent.press(view.getByTestId("retry-precon-preview"))
    expect(mockResolvePrecon).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(1000))
    expect(view.getByText("Retrying in 2s")).toBeTruthy()
    jest.setSystemTime(Date.now() + 10_000)
    await act(async () => jest.advanceTimersByTime(1000))
    expect(mockResolvePrecon).toHaveBeenCalledTimes(2)
    expect(view.queryByTestId("retry-precon-preview")).toBeNull()
    expect(view.getByText("1× Hakbal of the Surging Soul")).toBeTruthy()
  })

  it.each(["close", "unmount"])("cancels a preview cooldown on %s", async (exit) => {
    mockResolvePrecon.mockRejectedValueOnce(
      new ConvexError({
        code: "scryfall_rate_limited",
        message: "Scryfall requests are paused. Try again shortly.",
        retryAfterMs: 3000,
      }),
    )
    const view = renderAddDeck()
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    await act(async () => jest.advanceTimersByTime(400))
    fireEvent.press(view.getByText("Explorers of the Deep"))
    await waitFor(() => expect(view.getByText("Retrying in 3s")).toBeTruthy())
    if (exit === "close") fireEvent.press(view.getByLabelText("common:back"))
    else view.unmount()
    await act(async () => jest.advanceTimersByTime(4000))
    expect(mockResolvePrecon).toHaveBeenCalledTimes(1)
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
