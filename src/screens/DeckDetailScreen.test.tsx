import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DeckDetailScreen } from "./DeckDetailScreen"

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

const solRing = {
  _id: "card-1",
  _creationTime: 0,
  deckVersionId: "version-main",
  oracleId: "11111111-1111-1111-1111-111111111111",
  scryfallId: "22222222-2222-2222-2222-222222222222",
  name: "Sol Ring",
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

const mockDetail = {
  value: loadedDetail as Record<string, unknown> | undefined,
  error: undefined as Error | undefined,
}

jest.mock("convex/react", () => ({
  useQuery: (_reference: string, args: Record<string, unknown>) => {
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

function renderDetail() {
  return render(
    <ThemeProvider initialContext="light">
      <DeckDetailScreen deckId="deck-1" onBack={jest.fn()} />
    </ThemeProvider>,
  )
}

describe("DeckDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queryArgs.length = 0
    mockDetail.value = {
      ...loadedDetail,
      version: mainVersion,
      capacity: { used: 2, limit: 5, premium: true, canCreate: true },
    }
    mockDetail.error = undefined
  })

  it("opens read-only with the deck, its notes, and the selected version's record", () => {
    const view = renderDetail()
    expect(view.getByText("Magic · Commander · 1 card")).toBeTruthy()
    expect(view.getByTestId("deck-loading-progress").props.accessibilityValue).toEqual({
      text: "Deck loaded",
    })
    expect(view.getByText("50% win rate · 3W 3L 0D over 6 games")).toBeTruthy()
    expect(view.getByText("Current  ›")).toBeTruthy()
    fireEvent.press(view.getByTestId("deck-tab-notes"))
    expect(view.getByText("Ramp into big spells")).toBeTruthy()
    fireEvent.press(view.getByTestId("deck-tab-versions"))
    expect(view.getByText("The list I actually sleeve")).toBeTruthy()
    expect(view.getByText("1 card · 75% win rate · 3W 1L 0D over 4 games")).toBeTruthy()
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

  it("edits the list behind an explicit edit mode and saves into the same version", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    expect(view.getByTestId("card-search-input")).toBeTruthy()
    fireEvent.press(view.getAllByText("+")[0])
    fireEvent.press(view.getByTestId("save-version-button"))
    await waitFor(() => expect(mockSaveVersion).toHaveBeenCalledTimes(1))
    expect(mockSaveVersion).toHaveBeenCalledWith({
      deckId: "deck-1",
      versionId: "version-main",
      cards: [expect.objectContaining({ name: "Sol Ring", quantity: 2 })],
    })
  })

  it("throws away edits on discard", () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("edit-deck-button"))
    fireEvent.press(view.getAllByText("+")[0])
    expect(view.getByText("2× Sol Ring")).toBeTruthy()
    fireEvent.press(view.getByTestId("discard-edits-button"))
    expect(view.getByText("1× Sol Ring")).toBeTruthy()
    expect(mockSaveVersion).not.toHaveBeenCalled()
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

    fireEvent.press(view.getByText("3× Ash Blossom & Joyous Spring"))

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

    fireEvent.press(view.getByText("3× Riolu"))

    await waitFor(() => expect(view.getByText("Pokemon · Basic · Fighting")).toBeTruthy())
    expect(mockPokemonCardByReference).toHaveBeenCalledWith({
      name: "Riolu",
      originalReference: "MEG 76",
    })
  })

  it("switches the version being viewed", () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-tab-versions"))
    fireEvent.press(view.getByTestId("version-picker-version-sideboard"))
    expect(queryArgs.at(-1)).toEqual({ deckId: "deck-1", versionId: "version-sideboard" })
  })

  it("creates a version seeded from the one on screen", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-tab-versions"))
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
    fireEvent.press(view.getByTestId("deck-tab-versions"))
    fireEvent.press(view.getByTestId("version-picker-__new__"))
    expect(view.queryByTestId("deck-version-dialog")).toBeNull()
    expect(
      view.getByText("This deck holds up to 1 version. Delete one to add another."),
    ).toBeTruthy()
    expect(view.queryByText(/Premium/)).toBeNull()
  })

  it("deletes the selected version from the version editor behind a confirmation", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-tab-versions"))
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
    fireEvent.press(view.getByTestId("deck-tab-versions"))
    fireEvent.press(view.getByTestId("rename-version-button"))
    expect(view.queryByTestId("delete-version-button")).toBeNull()
  })

  it("archives the deck from deck settings behind a confirmation", async () => {
    const view = renderDetail()
    fireEvent.press(view.getByTestId("deck-settings-button"))
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
    expect(view.getByText("1× Sol Ring")).toBeTruthy()
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
