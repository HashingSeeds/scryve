import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AddDeckScreen } from "./AddDeckScreen"

const mockCreate = jest.fn()
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
const mockCardById = jest.fn(async () => ({
  manaCost: "{1}{G}{U}",
  typeLine: "Legendary Creature — Merfolk Scout",
  oracleText: "Explore twice.",
  setName: "The Lost Caverns of Ixalan Commander",
  collectorNumber: "3",
  rarity: "mythic",
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
  useQuery: () => {
    if (mockListMine.error) throw mockListMine.error
    return mockListMine.value
  },
  useMutation: (reference: string) =>
    reference === "decks.importResolved" ? mockImport : mockCreate,
  useAction: (reference: string) => {
    if (reference === "cards.byId") return mockCardById
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
      create: "decks.create",
      importResolved: "decks.importResolved",
    },
    deckImports: {
      searchPreconstructed: "deckImports.searchPreconstructed",
      previewPreconstructed: "deckImports.previewPreconstructed",
      resolvePreconstructed: "deckImports.resolvePreconstructed",
      resolvePasted: "deckImports.resolvePasted",
    },
    cards: {
      byId: "cards.byId",
    },
  },
}))

function atCapacity() {
  mockListMine.value = {
    ...readyShelf,
    capacity: { used: 1, limit: 1, premium: false, canCreate: false },
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
  fireEvent.press(view.getByTestId("format-picker"))
  fireEvent.press(view.getByTestId(`format-picker-options-${format}`))
}

function chooseMode(view: ReturnType<typeof renderAddDeck>, mode: string) {
  fireEvent.press(view.getByTestId("mode-picker"))
  fireEvent.press(view.getByTestId(`mode-picker-options-${mode}`))
}

function continueSetup(view: ReturnType<typeof renderAddDeck>) {
  fireEvent.press(view.getByTestId("continue-add-deck"))
}

describe("AddDeckScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockListMine.value = {
      ...readyShelf,
      capacity: { used: 1, limit: 100, premium: true, canCreate: true },
    }
    mockListMine.error = undefined
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("offers official, pasted, and scratch-built creation paths", () => {
    const view = renderAddDeck()
    expect(view.getByText("Official precon")).toBeTruthy()
    chooseMode(view, "paste")
    continueSetup(view)
    expect(view.getByText("Deck list")).toBeTruthy()
    fireEvent.press(view.getByTestId("change-deck-setup"))
    chooseMode(view, "blank")
    continueSetup(view)
    expect(view.getByText("Create deck")).toBeTruthy()
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

  it("blocks new decks and explains the limit once capacity is used up", () => {
    atCapacity()
    const view = renderAddDeck()
    expect(
      view.getByText("You've reached your deck limit. Archive a deck to add another."),
    ).toBeTruthy()
    expect(view.queryByText(/Premium/)).toBeNull()
    chooseMode(view, "blank")
    continueSetup(view)
    fireEvent.changeText(view.getByTestId("deck-name-input"), "Blocked Deck")
    fireEvent.press(view.getByText("Create deck"))
    expect(mockCreate).not.toHaveBeenCalled()
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
