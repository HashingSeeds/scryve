import { Linking } from "react-native"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { saveCardDetails } from "@/features/decks/cardDetailsCache"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { cardDetailsKey } from "@/features/decks/deckCards"
import {
  clearGuestDecks,
  guestDeckRouteId,
  loadGuestDecks,
  saveGuestDeck,
} from "@/features/decks/guestDeck"
import { ThemeProvider } from "@/theme/context"
import { captureAnalytics } from "@/utils/analytics"
import { clear } from "@/utils/storage"

import { AddDeckScreen, catalogPreviewSections } from "./AddDeckScreen"
import { integrationFor } from "../../convex/lib/integrations"

const mockPresentPaywall = jest.fn()
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
const mockConnection = { isWebSocketConnected: true }
const mockConvexState: { client: typeof mockConvexClient | undefined } = { client: undefined }
const mockResolvePasted = jest.fn()
const mockResolveLink = jest.fn()
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
const mockManifest: { value: unknown } = { value: undefined }
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
jest.mock("@/features/decks/guestDeck", () => {
  const actual = jest.requireActual("@/features/decks/guestDeck")
  return { ...actual, saveGuestDeck: jest.fn(actual.saveGuestDeck) }
})
const mockSaveDeck = jest.mocked(saveGuestDeck)

jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))

jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({
    configured: true,
    isLoading: false,
    presentPaywall: mockPresentPaywall,
  }),
}))

jest.mock("convex/react", () => ({
  useConvex: () => mockConvexState.client,
  useConvexConnectionState: () => mockConnection,
  useQuery: (reference: string) => {
    if (reference === "deckCatalogs.detail") return mockCatalogDetail.value
    if (reference === "integrationManifest.list") return mockManifest.value
    return undefined
  },
  useAction: (reference: string) => {
    if (reference === "cards.byId") return mockCardById
    if (reference === "cards.byCatalogId") return mockCatalogCardById
    if (reference === "cards.byPokemonReference") return mockPokemonCardByReference
    if (reference === "deckImports.resolveLink") return mockResolveLink
    if (reference === "deckCatalogs.browse") return mockBrowse
    if (reference === "deckImports.searchPreconstructed") return mockSearch
    if (reference === "deckImports.previewPreconstructed") return mockPreviewPrecon
    if (reference === "deckImports.resolvePreconstructed") return mockResolvePrecon
    return mockResolvePasted
  },
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    deckImports: {
      searchPreconstructed: "deckImports.searchPreconstructed",
      previewPreconstructed: "deckImports.previewPreconstructed",
      resolvePreconstructed: "deckImports.resolvePreconstructed",
      resolvePasted: "deckImports.resolvePasted",
      resolveLink: "deckImports.resolveLink",
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
    integrationManifest: { list: "integrationManifest.list" },
  },
}))

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
    clearGuestDecks()
    jest.useFakeTimers()
    mockCatalogDetail.value = undefined
    mockManifest.value = undefined
    mockConnection.isWebSocketConnected = true
  })

  it("hides Browse when the server switches example decks off", () => {
    const view = renderAddDeck()
    expect(view.getByTestId("mode-picker-options-precon")).toBeTruthy()

    const mtg = integrationFor("mtg")
    mockManifest.value = [
      {
        ...mtg,
        capabilities: {
          ...mtg.capabilities,
          exampleDecks: { ...mtg.capabilities.exampleDecks, release: "disabled" },
        },
      },
    ]
    view.rerender(
      <ThemeProvider initialContext="light">
        <AddDeckScreen onBack={jest.fn()} onCreated={jest.fn()} />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("mode-picker-options-precon")).toBeNull()
    expect(view.getByTestId("mode-picker-options-paste").props.accessibilityState.selected).toBe(
      true,
    )
  })

  it("warns when other players would see a neutral label instead of the deck name", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <AddDeckScreen onBack={jest.fn()} onCreated={jest.fn()} />
      </ThemeProvider>,
    )
    chooseMode(view, "paste")
    const warning = 'Other players will see "Deck" instead.'
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Gruul Stompy")
    expect(view.queryByText(warning)).toBeNull()
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Shitty Gruul")
    expect(view.getByText(warning)).toBeTruthy()
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

  it("saves a pasted list on this device", async () => {
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
        <AddDeckScreen onBack={jest.fn()} onCreated={onCreated} />
      </ThemeProvider>,
    )
    chooseFormat(view, "standard")
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Guest Forests")
    fireEvent.changeText(view.getByLabelText("Deck list"), "60 Forest")
    fireEvent.press(view.getByText("Review deck list"))
    await waitFor(() => expect(view.getByLabelText("60× Forest")).toBeTruthy())
    expect(loadGuestDecks()).toEqual([])
    expect(onCreated).not.toHaveBeenCalled()
    fireEvent.press(view.getByText("Save on device"))
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(guestDeckRouteId(loadGuestDecks()[0].localId)),
    )
    expect(loadGuestDecks()[0]?.deck).toMatchObject({
      name: "Guest Forests",
      format: "standard",
      cards: [{ name: "Forest", quantity: 60 }],
    })
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
    expect(mockSaveDeck).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("omit-import-problems"))
    expect(view.getByText(/2 unmatched or invalid lines removed/)).toBeTruthy()
    expect(view.queryByLabelText("Deck list")).toBeNull()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockSaveDeck).toHaveBeenCalledWith(
        expect.objectContaining({
          cards: [expect.objectContaining({ name: "Forest", quantity: 2 })],
        }),
      ),
    )
    fireEvent.press(view.getByRole("button", { name: "Back" }))
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
        expect.objectContaining({ cards: [expect.objectContaining(known)] }),
      ),
    )
    fireEvent.press(view.getByRole("button", { name: "Back" }))
    expect(view.getByLabelText("Deck list").props.value).toBe(source)
  })

  it("preserves the resolved draft and edited text when a repair request fails", async () => {
    mockResolvePasted.mockResolvedValueOnce({ ...resolvedForest, unresolved: ["Forst"] })
    const view = renderAddDeck()
    enterPasted(view, "2 Forest\n1 Forst")
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    fireEvent.press(view.getByRole("button", { name: "Back" }))
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
    expect(mockSaveDeck).not.toHaveBeenCalled()
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
    fireEvent.press(view.getByRole("button", { name: "Back" }))
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Edited deck",
          format: "modern",
        }),
      ),
    )
    expect(mockSaveDeck).not.toHaveBeenCalledWith(
      expect.objectContaining({ note: expect.anything() }),
    )
  })

  it("explains a blank name in review and restores editing", async () => {
    mockResolvePasted.mockResolvedValue(resolvedForest)
    const view = renderAddDeck()
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "   ")
    fireEvent.changeText(view.getByLabelText("Deck list"), "2 Forest")
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByText("Add a deck name.")).toBeTruthy())
    expect(view.getByText("Imported deck")).toBeTruthy()
    expect(view.getByTestId("save-import-button")).toBeDisabled()
    expect(mockSaveDeck).not.toHaveBeenCalled()
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    expect(view.getByTestId("deck-name-input").props.value).toBe("   ")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Named forests")
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    await waitFor(() => expect(view.getByText("Named forests")).toBeTruthy())
    expect(view.queryByText("Add a deck name.")).toBeNull()
    expect(view.getByTestId("save-import-button")).toBeEnabled()
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
      fireEvent.press(view.getByRole("button", { name: "Back" }))
      fireEvent.press(view.getByTestId("review-import-button"))
      await waitFor(() => expect(view.getByTestId("pasted-deck-review")).toBeTruthy())
      expectSections()
      fireEvent.press(view.getByTestId("save-import-button"))
      await waitFor(() =>
        expect(mockSaveDeck).toHaveBeenCalledWith(
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
    expect(mockSaveDeck).not.toHaveBeenCalled()
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "modern",
          cards: [expect.objectContaining({ quantity: 4, section: "main", board: "main" })],
        }),
      ),
    )
    expect(mockSaveDeck).not.toHaveBeenCalledWith(
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
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
      deviceId: expect.any(String),
    })
    fireEvent.press(view.getByLabelText("Add Sol Ring to deck"))
    fireEvent.press(view.getByLabelText("Add Sol Ring to deck"))
    fireEvent.press(
      within(view.UNSAFE_getByType(CardSearchScreen)).getByRole("button", { name: "Done" }),
    )
    expect(mockSaveDeck).not.toHaveBeenCalled()
    fireEvent.press(view.getByRole("button", { name: /^(Edit|Done)$/ }))
    expect(view.getByLabelText("2× Island")).toBeTruthy()
    expect(view.queryByLabelText("1× Island")).toBeNull()
    expect(view.getByLabelText("2× Sol Ring")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: "Back" }))
    expect(view.getByLabelText("Deck list").props.value).toBe(
      "2 Island (M21) 265\n1 Island (DMU) 278",
    )
    fireEvent.press(view.getByTestId("return-import-review-button"))
    expect(view.getByLabelText("2× Sol Ring")).toBeTruthy()
    expect(mockResolvePasted).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockSaveDeck).toHaveBeenCalledWith(
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
    fireEvent.press(view.getByRole("button", { name: "Back" }))
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
      expect(mockSaveDeck).toHaveBeenCalledWith(
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
    expect(mockCardById).toHaveBeenCalledWith({
      scryfallId: secondId,
      deviceId: expect.any(String),
    })
    expect(mockCardById).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByText("Close"))
    fireEvent.press(view.getByTestId("import-card-main-0"))
    await waitFor(() =>
      expect(mockCardById).toHaveBeenCalledWith({
        scryfallId: firstId,
        deviceId: expect.any(String),
      }),
    )
    fireEvent.press(view.getByText("Close"))
    fireEvent.press(view.getByTestId("import-card-main-1"))
    await waitFor(() => expect(view.getByTestId("card-focus-dialog")).toBeTruthy())
    expect(mockCardById).toHaveBeenCalledTimes(2)
    expect(mockSaveDeck).not.toHaveBeenCalled()
    fireEvent.press(view.getByRole("button", { name: "Back", includeHiddenElements: true }))
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
    expect(mockCatalogCardById).toHaveBeenCalledWith({
      game: "ygo",
      cardId: "14558127",
      deviceId: expect.any(String),
    })
    expect(mockCardById).not.toHaveBeenCalled()
    expect(mockSaveDeck).not.toHaveBeenCalled()
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
      deviceId: expect.any(String),
    })
    fireEvent.press(view.getByText("Close"))
    expect(view.getByTestId("import-card-thumbnail-main-0").props.source).toEqual([
      { uri: "https://assets.example/riolu/high.webp" },
    ])
    expect(mockSaveDeck).not.toHaveBeenCalled()
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
    expect(mockSaveDeck).not.toHaveBeenCalled()
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
      expect(mockSaveDeck).not.toHaveBeenCalled()
      if (change === "input") expect(view.getByLabelText("Deck list").props.value).toBe("3 Forest")
    },
  )

  const resolvedArchidekt = {
    ...resolvedForest,
    name: "Public Forests",
    format: "modern",
    sourceName: "Archidekt",
    sourceUrl: "https://archidekt.com/decks/12345",
    author: "ForestPlayer",
  }

  function enterLink(view: ReturnType<typeof renderAddDeck>) {
    chooseMode(view, "paste")
    fireEvent.press(view.getByTestId("import-source-link"))
    fireEvent.changeText(view.getByTestId("deck-link-input"), resolvedArchidekt.sourceUrl)
    fireEvent.press(view.getByTestId("review-import-button"))
  }

  it("edits an Archidekt draft before saving with attribution", async () => {
    mockResolveLink.mockResolvedValue(resolvedArchidekt)
    const onCreated = jest.fn()
    const view = renderAddDeck(onCreated)
    enterLink(view)
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    expect(view.getByText("Public Forests")).toBeTruthy()
    expect(view.getByText("Modern · 2 cards")).toBeTruthy()
    expect(view.queryByTestId("deck-name-input")).toBeNull()
    expect(view.queryByTestId("deck-link-input")).toBeNull()
    expect(view.queryByTestId("mode-picker-options")).toBeNull()
    expect(view.queryByTestId("format-picker-options")).toBeNull()
    expect(view.getByText("Archidekt · ForestPlayer")).toBeTruthy()
    expect(mockResolveLink).toHaveBeenCalledWith({
      url: resolvedArchidekt.sourceUrl,
      game: "mtg",
    })
    expect(mockResolvePasted).not.toHaveBeenCalled()
    expect(mockSaveDeck).not.toHaveBeenCalled()
    expect(loadGuestDecks()).toEqual([])
    const openSource = jest.spyOn(Linking, "openURL").mockResolvedValueOnce(undefined)
    fireEvent.press(view.getByLabelText("View on Archidekt by ForestPlayer"))
    expect(openSource).toHaveBeenCalledWith(resolvedArchidekt.sourceUrl)
    openSource.mockRestore()
    fireEvent.press(view.getByRole("button", { name: "Edit" }))
    expect(view.getByTestId("pasted-deck-review")).toBeTruthy()
    expect(view.queryByTestId("deck-link-input")).toBeNull()
    fireEvent.press(view.getByLabelText("Decrease Forest"))
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(guestDeckRouteId(loadGuestDecks()[0]?.localId)),
    )
    const expectedDeck = {
      name: "Public Forests",
      format: "modern",
      game: "mtg",
      note: "Imported from Archidekt by ForestPlayer\nhttps://archidekt.com/decks/12345",
      cards: [expect.objectContaining({ name: "Forest", quantity: 1 })],
    }
    expect(loadGuestDecks()[0]?.deck).toMatchObject(expectedDeck)
  })

  it("imports a YGOPRODeck link without an author into the current format", async () => {
    mockResolveLink.mockResolvedValueOnce({
      sourceName: "YGOPRODeck",
      name: "Blue-Eyes for Duelingbook",
      sourceUrl: "https://ygoprodeck.com/deck/312866",
      cards: [
        {
          game: "ygo",
          cardId: "14558127",
          name: "Ash Blossom & Joyous Spring",
          quantity: 3,
          section: "main",
          entryKind: "card",
          originalReference: "14558127",
        },
      ],
      unresolved: [],
      invalidLines: [],
    })
    const view = renderAddDeck()
    chooseGame(view, "ygo")
    chooseMode(view, "paste")
    fireEvent.press(view.getByTestId("import-source-link"))
    fireEvent.changeText(
      view.getByTestId("deck-link-input"),
      "https://ygoprodeck.com/deck/x-312866",
    )
    expect(view.getByText("Review YGOPRODeck deck")).toBeTruthy()
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByText("YGOPRODeck")).toBeTruthy())
    expect(mockResolveLink).toHaveBeenCalledWith({
      url: "https://ygoprodeck.com/deck/x-312866",
      game: "ygo",
    })
    expect(view.getByText("Advanced · 3 cards")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockSaveDeck).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Blue-Eyes for Duelingbook",
          game: "ygo",
          format: "advanced",
          note: "Imported from YGOPRODeck\nhttps://ygoprodeck.com/deck/312866",
        }),
      ),
    )
  })

  it("keeps a player's chosen format when reviewing the same Archidekt link again", async () => {
    mockResolveLink.mockResolvedValue(resolvedArchidekt)
    const view = renderAddDeck()
    enterLink(view)
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    expect(view.getByText("Modern · 2 cards")).toBeTruthy()
    fireEvent.press(view.getByRole("button", { name: "Back" }))
    chooseFormat(view, "standard")
    expect(view.queryByTestId("save-import-button")).toBeNull()
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(view.getByTestId("save-import-button")).toBeEnabled())
    expect(view.getByText("Standard · 2 cards")).toBeTruthy()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockSaveDeck).toHaveBeenCalledWith(expect.objectContaining({ format: "standard" })),
    )
  })

  it("keeps reloaded Archidekt commanders in main after editing to Modern", async () => {
    mockResolveLink.mockResolvedValue({
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
    fireEvent.press(view.getByRole("button", { name: "Back" }))
    fireEvent.press(view.getByTestId("review-import-button"))
    await waitFor(() => expect(mockResolveLink).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.getByTestId("save-import-button")).toBeEnabled())
    expect(view.getByText("Modern · 3 cards")).toBeTruthy()
    expect(view.getByLabelText("3× Forest")).toBeTruthy()
    expect(view.queryByTestId("import-card-commander-0")).toBeNull()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockSaveDeck).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "modern",
          cards: [
            expect.objectContaining({ quantity: 3, board: "main", scryfallId: "forest-print" }),
          ],
        }),
      ),
    )
  })

  it.each(["url", "kind"])("ignores Archidekt results after changing %s", async (change) => {
    let finish: ((result: typeof resolvedArchidekt) => void) | undefined
    mockResolveLink.mockImplementationOnce(
      () =>
        new Promise<typeof resolvedArchidekt>((resolve) => {
          finish = resolve
        }),
    )
    const view = renderAddDeck()
    enterLink(view)
    if (change === "url")
      fireEvent.changeText(view.getByTestId("deck-link-input"), "https://archidekt.com/decks/67890")
    else fireEvent.press(view.getByTestId("import-source-text"))
    await act(async () => finish?.(resolvedArchidekt))
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.queryByText("Archidekt · ForestPlayer")).toBeNull()
    expect(view.getByTestId("mode-picker-options")).toBeTruthy()
    expect(view.queryByTestId("save-import-button")).toBeNull()
    expect(mockSaveDeck).not.toHaveBeenCalled()
  })

  it("keeps a failed Archidekt URL and offers a text export fallback", async () => {
    mockResolveLink.mockRejectedValueOnce(
      new ConvexError({ message: "Use a public Archidekt deck or paste its text export." }),
    )
    const view = renderAddDeck()
    enterLink(view)
    await waitFor(() =>
      expect(view.getByText("Use a public Archidekt deck or paste its text export.")).toBeTruthy(),
    )
    expect(view.getByTestId("deck-link-input").props.value).toBe(resolvedArchidekt.sourceUrl)
    fireEvent.press(view.getByText("Paste text instead"))
    expect(view.getByLabelText("Deck list")).toBeTruthy()
    expect(mockSaveDeck).not.toHaveBeenCalled()
  })

  it("returns to the same edited Archidekt draft after changing source", async () => {
    mockResolveLink.mockResolvedValue(resolvedArchidekt)
    const view = renderAddDeck()
    chooseMode(view, "paste")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "My forests")
    enterLink(view)
    await waitFor(() => expect(view.getByText("My forests")).toBeTruthy())
    expect(view.getByText("Modern · 2 cards")).toBeTruthy()
    expect(view.queryByTestId("game-picker-options")).toBeNull()
    expect(view.queryByTestId("deck-link-input")).toBeNull()
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    fireEvent.press(view.getByRole("button", { name: "Edit" }))
    fireEvent.press(view.getByLabelText("Increase Forest"))
    fireEvent.press(view.getByRole("button", { name: "Back" }))
    expect(view.queryByTestId("pasted-deck-review")).toBeNull()
    expect(view.queryByTestId("save-import-button")).toBeNull()
    expect(view.getByTestId("deck-link-input").props.value).toBe(resolvedArchidekt.sourceUrl)
    expect(view.getByTestId("deck-name-input").props.value).toBe("My forests")
    expect(view.getByTestId("format-picker-options").props.accessibilityLabel).toBe(
      "Format, Modern",
    )
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Edited forests")
    fireEvent.press(view.getByTestId("return-import-review-button"))
    await waitFor(() => expect(view.getByText("Edited forests")).toBeTruthy())
    expect(view.getByLabelText("3× Forest")).toBeTruthy()
    expect(mockResolveLink).toHaveBeenCalledTimes(1)
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    expect(mockSaveDeck).not.toHaveBeenCalled()
  })

  it("keeps Archidekt attribution separate from existing Build notes", async () => {
    mockResolveLink.mockResolvedValue(resolvedArchidekt)
    const view = renderAddDeck()
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-note-input"), "x".repeat(1000))
    enterLink(view)
    await waitFor(() => expect(view.getByLabelText("2× Forest")).toBeTruthy())
    expect(view.getByTestId("save-import-button")).toBeEnabled()
    fireEvent.press(view.getByTestId("save-import-button"))
    await waitFor(() =>
      expect(mockSaveDeck).toHaveBeenCalledWith(
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

  it("waits for Browse to answer before saying a format has no decks", async () => {
    let answer!: (decks: MockCatalogDeck[]) => void
    mockSearch.mockResolvedValueOnce([])
    mockSearchTopDecks.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const view = renderAddDeck()
    chooseFormat(view, "commander")
    expect(view.queryByText("No decks here yet")).toBeNull()
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByText("Loading decks…")).toBeTruthy()
    expect(view.queryByText("No decks here yet")).toBeNull()
    await act(async () => answer([]))
    expect(view.getByText("No decks here yet")).toBeTruthy()
    expect(captureAnalytics).toHaveBeenCalledWith("deck_browse_empty", {
      system: "mtg",
      format: "commander",
      status: "ready",
    })
  })

  it("shows an offline note instead of loading forever and retries on reconnect", async () => {
    mockConnection.isWebSocketConnected = false
    mockBrowse.mockReturnValueOnce(new Promise(() => {}))
    const view = renderAddDeck()
    chooseGame(view, "ygo")
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByText(/You're offline/)).toBeTruthy()
    expect(view.queryByText("Loading decks…")).toBeNull()
    mockSearchTopDecks.mockResolvedValueOnce([
      { _id: "back", game: "ygo", name: "Back online deck", kind: "tournament" },
    ])
    mockConnection.isWebSocketConnected = true
    view.rerender(
      <ThemeProvider initialContext="light">
        <AddDeckScreen onBack={jest.fn()} onCreated={jest.fn()} />
      </ThemeProvider>,
    )
    await waitFor(() => expect(view.getByText("Back online deck")).toBeTruthy())
    expect(view.queryByText(/You're offline/)).toBeNull()
    expect(mockBrowse).toHaveBeenCalledTimes(2)
  })

  it("retries a failed Load more from its cursor and keeps loaded decks", async () => {
    mockBrowse
      .mockResolvedValueOnce({
        decks: [{ _id: "first", game: "ygo", name: "First deck", kind: "tournament" }],
        cursor: "next-page",
        status: "ready",
        retryAfterMs: undefined,
      })
      .mockRejectedValueOnce(new Error("Connection lost while action was in flight"))
    const view = renderAddDeck()
    chooseGame(view, "ygo")
    await act(async () => jest.advanceTimersByTime(400))
    fireEvent.press(view.getByText("Load more"))
    await waitFor(() => expect(view.getByText("Retry")).toBeTruthy())
    mockSearchTopDecks.mockResolvedValueOnce([
      { _id: "next", game: "ygo", name: "Next deck", kind: "tournament" },
    ])
    fireEvent.press(view.getByText("Retry"))
    await waitFor(() => expect(view.getByText("Next deck")).toBeTruthy())
    expect(view.getByText("First deck")).toBeTruthy()
    expect(mockBrowse).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "next-page" }))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("saves a guest's second blank deck locally", () => {
    const first = saveGuestDeck({ name: "First", format: "commander", game: "mtg", cards: [] })
    const onCreated = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <AddDeckScreen onBack={jest.fn()} onCreated={onCreated} />
      </ThemeProvider>,
    )
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Guest deck")
    fireEvent.press(view.getByText("Create deck"))
    const [saved, second] = loadGuestDecks()
    expect(saved).toEqual(first)
    expect(second?.deck.name).toBe("Guest deck")
    expect(onCreated).toHaveBeenCalledWith(guestDeckRouteId(second.localId))
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
    expect(mockSaveDeck).not.toHaveBeenCalled()
    expect(view.getByText("Magic · Commander · 1 card")).toBeTruthy()
    expect(view.getByText("1× Hakbal of the Surging Soul")).toBeTruthy()
    expect(view.queryByTestId("deck-note-input")).toBeNull()
    fireEvent.press(view.getByTestId("import-preview-button"))
    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1))
    expect(mockSaveDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Explorers of the Deep",
        format: "commander",
        game: "mtg",
      }),
    )
    expect(onCreated).toHaveBeenCalledWith(guestDeckRouteId(loadGuestDecks()[0].localId))
    expect(mockSaveDeck).toHaveBeenCalledWith(
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
        <AddDeckScreen onBack={jest.fn()} onCreated={jest.fn()} />
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
      deviceId: expect.any(String),
    })
    expect(view.getByText("Legendary Creature — Merfolk Scout")).toBeTruthy()
    expect(view.queryByTestId("card-focus-increment")).toBeNull()
    expect(view.queryByTestId("card-focus-decrement")).toBeNull()
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
    expect(mockCatalogCardById).toHaveBeenCalledWith({
      game: "ygo",
      cardId: "14558127",
      deviceId: expect.any(String),
    })
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
      deviceId: expect.any(String),
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
    expect(loadGuestDecks()[0]?.deck).toEqual({
      name: "Scratch Deck",
      format: "modern",
      game: "mtg",
      note: "Testing a new sideboard plan",
      cards: [],
    })
  })

  it("creates a deck on this device without waiting on the server", () => {
    mockConnection.isWebSocketConnected = false
    const onCreated = jest.fn()
    const view = renderAddDeck(onCreated)
    chooseMode(view, "blank")
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Offline Deck")
    fireEvent.press(view.getByText("Create deck"))
    const [saved] = loadGuestDecks()
    expect(saved?.deck).toMatchObject({ name: "Offline Deck", cards: [] })
    expect(onCreated).toHaveBeenCalledWith(guestDeckRouteId(saved.localId))
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
    if (exit === "close") fireEvent.press(view.getByLabelText("Back"))
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
