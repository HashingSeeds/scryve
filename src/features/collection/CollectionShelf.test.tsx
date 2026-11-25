import { act, fireEvent, render } from "@testing-library/react-native"

import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

import { syncCatalogPrintingsAndPrices } from "./catalogSync"
import { CollectionShelf } from "./CollectionShelf"
import {
  addCollectionCard,
  createBinder,
  listBinders,
  listCollectionEntries,
} from "./collectionStore"
import { TradeCalculatorModal } from "./TradeCalculatorModal"
import { encodeFinishes, encodeRarity } from "../../../convex/lib/cardPricing"

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
    clear()
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
    catalogDb.replacePrices("mtg", [
      {
        game: "mtg",
        printingId: "cmm-410",
        finish: "nonfoil",
        source: "tcgplayer",
        currency: "USD",
        retailCents: 250,
        updatedAt: "2026-11-24T00:00:00Z",
      },
    ])
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
      cardId: "name:sol ring",
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

  it("revalues the shelf when a price sync keeps the same row count", async () => {
    catalogDb.setMeta("mtg:printings_checked_at", String(Date.now()))
    catalogDb.setMeta("mtg:prices_checked_at", String(Date.now()))
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
    })
    const view = render(
      <ThemeProvider initialContext="dark">
        <CollectionShelf mode="collection" />
      </ThemeProvider>,
    )
    expect(view.getByText("$2.50")).toBeTruthy()

    const fetcher = jest.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/datasets/mtg/prices.json")
        ? new Response(
            JSON.stringify({
              version: "v2",
              asOf: 1_764_000_000_000,
              prices: { "cmm-410": [300] },
            }),
            { status: 200 },
          )
        : new Response(null, { status: 304 }),
    ) as unknown as typeof fetch
    await act(() => syncCatalogPrintingsAndPrices("mtg", { fetcher, force: true }))

    expect(view.getByText("$3.00")).toBeTruthy()
    expect(view.queryByText("$2.50")).toBeNull()
  })

  it("holds the shelf while scanning and refreshes it once when the session view closes", async () => {
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
    })
    const list = jest.spyOn(localCardDb, "listCollectionEntries")
    const shelfLists = () =>
      list.mock.calls.filter(([filter]) => filter?.game === "mtg" && !filter.cardId).length
    try {
      const view = render(
        <ThemeProvider initialContext="dark">
          <CollectionShelf mode="collection" />
        </ThemeProvider>,
      )
      expect(shelfLists()).toBe(1)

      fireEvent.press(view.getByTestId("collection-scan-button"))
      const [session] = listBinders("scan_session")
      act(() => {
        addCollectionCard({
          game: "mtg",
          cardId: "ora-sol",
          printingId: "cmm-410",
          name: "Sol Ring",
          setCode: "cmm",
          collectorNumber: "410",
          binderId: session.id,
        })
      })
      await act(async () => fireEvent.press(view.getByText("Done")))
      expect(shelfLists()).toBe(1)

      fireEvent.press(view.getByText("Back"))
      expect(shelfLists()).toBe(2)
    } finally {
      list.mockRestore()
    }
  })

  it("lists the collection once across remounts when nothing changed", () => {
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
    })
    const list = jest.spyOn(localCardDb, "listCollectionEntries")
    try {
      const shelf = (
        <ThemeProvider initialContext="dark">
          <CollectionShelf mode="collection" />
        </ThemeProvider>
      )
      render(shelf).unmount()
      render(shelf).unmount()
      expect(list.mock.calls.filter(([filter]) => filter?.game === "mtg")).toHaveLength(1)
    } finally {
      list.mockRestore()
    }
  })

  it("refreshes quick-add matches when initial catalog sync completes", async () => {
    catalogDb.clearAll()
    let releasePrintings!: () => void
    const printingsReady = new Promise<void>((resolve) => {
      releasePrintings = resolve
    })
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.endsWith("/datasets/mtg/printings.json")) {
        await printingsReady
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            version: "2026-11-24",
            sets: { cmm: "Commander Masters" },
            rows: [
              [
                "cmm-410",
                "ora-sol",
                "Sol Ring",
                "cmm",
                "410",
                encodeRarity("uncommon"),
                encodeFinishes(["nonfoil", "foil"]),
                504123,
                "front/1/2/cmm.jpg",
              ],
            ],
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ version: "2026-11-24", asOf: 1_764_000_000_000, prices: {} }),
      }
    }) as unknown as typeof fetch

    try {
      const view = render(
        <ThemeProvider initialContext="dark">
          <CollectionShelf mode="collection" />
        </ThemeProvider>,
      )

      fireEvent.press(view.getByTestId("collection-add-card-button"))
      fireEvent.changeText(view.getByTestId("collection-add-card-input"), "Sol Ring")
      expect(view.queryByText("Sol Ring · CMM · #410")).toBeNull()

      releasePrintings()
      expect(await view.findByText("Sol Ring · CMM · #410")).toBeTruthy()
    } finally {
      global.fetch = originalFetch
    }
  })
})
