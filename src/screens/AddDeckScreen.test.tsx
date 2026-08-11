import { fireEvent, render, waitFor } from "@testing-library/react-native"

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
const mockResolvePasted = jest.fn()
const mockListMine = {
  value: {
    decks: [
      {
        _id: "existing-deck",
        name: "Existing Deck",
        format: "commander",
        game: "mtg",
        versionNumber: 1,
        coverImageUrl: undefined,
      },
    ],
    capacity: { used: 1, limit: 100, premium: true, canCreate: true },
  },
}

jest.mock("convex/react", () => ({
  useQuery: () => mockListMine.value,
  useMutation: (reference: string) =>
    reference === "decks.importResolved" ? mockImport : mockCreate,
  useAction: (reference: string) => {
    if (reference === "deckImports.searchPreconstructed") return mockSearch
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
      resolvePreconstructed: "deckImports.resolvePreconstructed",
      resolvePasted: "deckImports.resolvePasted",
    },
  },
}))

function atCapacity() {
  mockListMine.value = {
    ...mockListMine.value,
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

describe("AddDeckScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListMine.value = {
      ...mockListMine.value,
      capacity: { used: 1, limit: 100, premium: true, canCreate: true },
    }
  })

  it("offers official, pasted, and blank deck creation paths", () => {
    const view = renderAddDeck()
    expect(view.getByText("Official precon")).toBeTruthy()
    fireEvent.press(view.getByText("Paste list"))
    expect(view.getByText("Deck list")).toBeTruthy()
    fireEvent.press(view.getByText("Blank"))
    expect(view.getByText("Create blank deck")).toBeTruthy()
  })

  it("resolves an official list before creating version one", async () => {
    const onCreated = jest.fn()
    const view = renderAddDeck(onCreated)
    fireEvent.changeText(view.getByTestId("precon-search-input"), "Explorers")
    fireEvent.press(view.getByText("Search preconstructed decks"))
    await waitFor(() => expect(view.getByText("Explorers of the Deep")).toBeTruthy())
    fireEvent.press(view.getByText("Explorers of the Deep"))
    await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1))
    expect(mockResolvePrecon).toHaveBeenCalledWith({ fileName: "ExplorersOfTheDeep_LCC" })
    expect(mockImport).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Explorers of the Deep", format: "commander" }),
    )
    expect(onCreated).toHaveBeenCalledWith("deck-imported")
  })

  it("blocks new decks and explains the limit once capacity is used up", () => {
    atCapacity()
    const view = renderAddDeck()
    expect(
      view.getByText(
        "Free accounts include one deck. Premium unlocks more — archive your deck or upgrade to add another.",
      ),
    ).toBeTruthy()
    fireEvent.press(view.getByText("Blank"))
    fireEvent.changeText(view.getByDisplayValue(""), "Blocked Deck")
    fireEvent.press(view.getByText("Create blank deck"))
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
