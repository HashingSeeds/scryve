import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DecksScreen } from "./DecksScreen"

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
}))

jest.mock("../../convex/_generated/api", () => ({
  api: {
    decks: {
      listMine: "decks.listMine",
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
    mockListMine.value = {
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
    }
  })

  it("shelves one tile per deck and selects the tapped deck", () => {
    const onSelect = jest.fn()
    const view = renderShelf({ onSelect })
    expect(view.getByText("v1")).toBeTruthy()
    expect(view.getByTestId("add-deck-tile")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Existing Deck"))
    expect(onSelect).toHaveBeenCalledWith("existing-deck")
  })

  it("opens the add-deck route from the trailing tile", () => {
    const onAddDeck = jest.fn()
    const view = renderShelf({ onAddDeck })
    fireEvent.press(view.getByTestId("add-deck-tile"))
    expect(onAddDeck).toHaveBeenCalledTimes(1)
  })

  it("keeps the add tile and hints when no decks exist yet", () => {
    mockListMine.value = {
      decks: [],
      capacity: { used: 0, limit: 100, premium: true, canCreate: true },
    }
    const view = renderShelf()
    expect(view.getByTestId("add-deck-tile")).toBeTruthy()
    expect(view.getByText("No decks yet — add your first deck.")).toBeTruthy()
  })

  it("explains the free deck limit once capacity is used up", () => {
    mockListMine.value = {
      ...mockListMine.value,
      capacity: { used: 1, limit: 1, premium: false, canCreate: false },
    }
    const view = renderShelf()
    expect(view.getByText("1 of 1 deck used")).toBeTruthy()
    expect(
      view.getByText("Free accounts include one deck. Premium unlocks unlimited decks."),
    ).toBeTruthy()
  })
})
