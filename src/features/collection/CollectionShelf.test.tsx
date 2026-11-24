import { act, fireEvent, render } from "@testing-library/react-native"

import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { ThemeProvider } from "@/theme/context"

import { CollectionShelf } from "./CollectionShelf"
import {
  addCollectionCard,
  createBinder,
  listBinders,
  listCollectionEntries,
} from "./collectionStore"
import { TradeCalculatorModal } from "./TradeCalculatorModal"

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

    fireEvent.press(view.getByTestId("delete-binder-button"))
    expect(listBinders("binder")).toHaveLength(0)
    const remaining = listCollectionEntries({ game: "mtg" })
    expect(remaining).toHaveLength(1)
    expect(remaining[0].binderId).toBeUndefined()
    expect(remaining[0].quantity).toBe(2)
  })

  it("scopes scan sessions to the active game", () => {
    createBinder({ kind: "scan_session", name: "MTG Box", game: "mtg" })
    createBinder({ kind: "scan_session", name: "Pokemon Box", game: "pokemon" })

    const mtgView = render(
      <ThemeProvider initialContext="dark">
        <CollectionShelf mode="scans" game="mtg" />
      </ThemeProvider>,
    )
    expect(mtgView.getByText("MTG Box")).toBeTruthy()
    expect(mtgView.queryByText("Pokemon Box")).toBeNull()
  })

  it("validates condition and excludes scan sessions before committing a trade, and merges colliding edits", () => {
    const scanSession = createBinder({ kind: "scan_session", name: "Temp Scan", game: "mtg" })
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
      finish: "nonfoil",
      condition: "LP",
      quantity: 1,
    })
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
      finish: "nonfoil",
      condition: "NM",
      quantity: 2,
      binderId: scanSession.id,
    })

    const view = render(
      <ThemeProvider initialContext="dark">
        <TradeCalculatorModal visible game="mtg" onClose={jest.fn()} />
      </ThemeProvider>,
    )

    fireEvent.changeText(view.getByTestId("trade-search-input"), "Sol Ring")
    fireEvent.press(view.getByText("Sol Ring · CMM · #410"))
    fireEvent.press(view.getByTestId("trade-commit-button"))
    expect(view.getByTestId("trade-error-message")).toBeTruthy()
    expect(listCollectionEntries({ game: "mtg" })).toHaveLength(2)

    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
      finish: "nonfoil",
      condition: "NM",
      quantity: 1,
    })
    fireEvent.press(view.getByTestId("trade-commit-button"))
    expect(view.queryByTestId("trade-error-message")).toBeNull()
    const after = listCollectionEntries({ game: "mtg" })
    expect(after.find((entry) => entry.condition === "LP")?.quantity).toBe(1)
    expect(after.find((entry) => entry.binderId === scanSession.id)?.quantity).toBe(2)
    expect(after.find((entry) => !entry.binderId && entry.condition === "NM")).toBeUndefined()
  })
})
