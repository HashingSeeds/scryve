import { act, fireEvent, render } from "@testing-library/react-native"

import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { ThemeProvider } from "@/theme/context"

import { CollectionShelf } from "./CollectionShelf"
import { listBinders, listCollectionEntries } from "./collectionStore"

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}))
jest.mock("@/features/decks/useCardNameIndex", () => ({
  useCardNameIndex: () => undefined,
}))
jest.mock("../../../modules/card-text-reader", () => ({
  CardTextCamera: () => null,
  canReadCardText: false,
  scanHaptic: jest.fn(),
  prepareScanHaptics: jest.fn(),
}))

describe("CollectionShelf", () => {
  beforeEach(() => {
    localCardDb.clearAll()
    catalogDb.clearAll()
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "cmm-410",
          cardId: "ora-sol",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "cmm",
          setName: "Commander Masters",
          collectorNumber: "410",
          finishes: ["nonfoil", "foil"],
        },
      ],
      "v1",
    )
    catalogDb.replacePrices(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "cmm-410",
          finish: "nonfoil",
          source: "tcgplayer",
          currency: "USD",
          retailCents: 250,
          updatedAt: "2026-11-24T00:00:00Z",
        },
      ],
      "2026-11-24T00:00:00Z",
    )
  })

  it("creates binders, imports CSV entries, and renders valued collection rows", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <CollectionShelf mode="collection" />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("collection-new-binder-button"))
    fireEvent.changeText(view.getByTestId("new-binder-name-input"), "Trade Binder")
    fireEvent.press(view.getByTestId("create-binder-submit"))
    expect(listBinders("binder").map((b) => b.name)).toEqual(["Trade Binder"])

    fireEvent.press(view.getByTestId("collection-import-button"))
    fireEvent.changeText(
      view.getByTestId("collection-import-input"),
      "Count,Name,Edition,Collector Number\n2,Sol Ring,CMM,410",
    )
    act(() => fireEvent.press(view.getByTestId("collection-import-submit")))

    const stored = listCollectionEntries({ game: "mtg" })
    expect(stored).toHaveLength(1)
    expect(stored[0].quantity).toBe(2)
    expect(view.getByText("Sol Ring")).toBeTruthy()
    expect(view.getByText("$5.00")).toBeTruthy()
  })
})
