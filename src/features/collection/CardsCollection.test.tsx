import { act, fireEvent, render } from "@testing-library/react-native"

import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

import { CardsCollection } from "./CardsCollection"
import { syncCatalogPrintingsAndPrices } from "./catalogSync"
import {
  addCollectionCard,
  createBinder,
  listBinders,
  listCollectionEntries,
} from "./collectionStore"
import { TradeCalculatorModal } from "./TradeCalculatorModal"

const mockAction = jest.fn()
jest.mock("convex/react", () => ({
  useConvex: () => ({ action: mockAction, query: jest.fn().mockResolvedValue([]) }),
  useAction: () => jest.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}))
jest.mock("@legendapp/list/react-native", () =>
  require("../../../test/support/legendListAsFlatList"),
)
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}))
jest.mock("@/features/decks/useCardNameIndex", () => ({ useCardNameIndex: () => undefined }))
jest.mock("@/features/decks/CardScanner", () => {
  const { Pressable } = jest.requireActual("react-native")
  return {
    CardScanner: ({ onClose }: { onClose: () => void }) => (
      <Pressable testID="card-scanner-close" onPress={onClose} />
    ),
  }
})

const solRing = {
  game: "mtg",
  cardId: "ora-sol",
  printingId: "cmm-410",
  name: "Sol Ring",
  setCode: "cmm",
  collectorNumber: "410",
}

function renderCards(game: "mtg" | "pokemon" = "mtg") {
  return render(
    <ThemeProvider initialContext="dark">
      <CardsCollection
        game={game}
        format="commander"
        back={{ label: "Play", onPress: jest.fn() }}
        onGameChange={jest.fn()}
      />
    </ThemeProvider>,
  )
}

function choose(view: ReturnType<typeof renderCards>, action: string) {
  fireEvent.press(view.getByTestId("collection-actions-button"))
  fireEvent.press(view.getByTestId(`deck-action-${action}`))
}

beforeEach(() => {
  clear()
  mockAction.mockReset()
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

it("makes a binder from the menu, imports into it, and keeps its cards when it is deleted", () => {
  const view = renderCards()

  choose(view, "new-binder")
  fireEvent.changeText(view.getByTestId("new-binder-name-input"), "Trade Binder")
  fireEvent.press(view.getByTestId("create-binder-submit"))
  const [binder] = listBinders("binder")
  expect(binder.name).toBe("Trade Binder")
  expect(view.getByTestId(`collection-scopes-${binder.id}`).props.accessibilityState).toMatchObject(
    { selected: true },
  )

  choose(view, "import-export")
  fireEvent.changeText(
    view.getByTestId("collection-import-input"),
    "Count,Name,Edition,Collector Number\n2,Sol Ring,CMM,410",
  )
  act(() => fireEvent.press(view.getByTestId("collection-import-submit")))
  expect(listCollectionEntries({ binderId: binder.id })).toHaveLength(1)
  expect(view.getByText("CMM · #410 · $5.00")).toBeTruthy()
  expect(view.getByTestId("collection-summary").props.children).toBe("2 cards · $5.00")

  choose(view, "delete-binder")
  expect(listBinders("binder")).toHaveLength(0)
  const [kept] = listCollectionEntries({ game: "mtg" })
  expect(kept).toMatchObject({ quantity: 2 })
  expect(kept.binderId).toBeUndefined()
})

it("lists owned matches first and adds a catalog card to the open binder", async () => {
  const binder = createBinder({ kind: "binder", name: "Cube", game: "mtg" })
  addCollectionCard({ ...solRing, printingId: "old-sol", setCode: "lea", collectorNumber: "1" })
  mockAction.mockResolvedValue([
    { scryfallId: "cmm-410", oracleId: "ora-sol", name: "Sol Ring", typeLine: "Artifact" },
  ])
  jest.useFakeTimers()
  try {
    const view = renderCards()
    fireEvent.press(view.getByTestId(`collection-scopes-${binder.id}`))
    fireEvent.changeText(view.getByTestId("card-search-input"), "sol")
    await act(async () => jest.advanceTimersByTime(400))

    expect(view.getByText("Catalog")).toBeTruthy()
    expect(view.getByText("CMM · #410 · $2.50")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Add Sol Ring"))

    expect(listCollectionEntries({ binderId: binder.id })).toEqual([
      expect.objectContaining({ printingId: "cmm-410", quantity: 1 }),
    ])
    expect(view.queryByText("Catalog")).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

it("drops a scan session closed with no cards and opens one that kept cards", () => {
  const view = renderCards()

  fireEvent.press(view.getByTestId("collection-scan-button"))
  expect(listBinders("scan_session")).toHaveLength(1)
  fireEvent.press(view.getByTestId("card-scanner-close"))
  expect(listBinders("scan_session")).toHaveLength(0)

  fireEvent.press(view.getByTestId("collection-scan-button"))
  const [session] = listBinders("scan_session")
  act(() => {
    addCollectionCard({ ...solRing, binderId: session.id })
  })
  fireEvent.press(view.getByTestId("card-scanner-close"))
  expect(
    view.getByTestId(`collection-scopes-${session.id}`).props.accessibilityState,
  ).toMatchObject({ selected: true })
  fireEvent.press(view.getByTestId("collection-scan-more"))
  expect(view.getByTestId("card-scanner-close")).toBeTruthy()
})

it("shows only the open game's binders and scan sessions", () => {
  createBinder({ kind: "scan_session", name: "MTG Box", game: "mtg" })
  createBinder({ kind: "scan_session", name: "Pokemon Box", game: "pokemon" })

  const view = renderCards("mtg")
  expect(view.getByText("MTG Box")).toBeTruthy()
  expect(view.queryByText("Pokemon Box")).toBeNull()
})

it("revalues the list when a price sync keeps the same row count", async () => {
  catalogDb.setMeta("mtg:printings_checked_at", String(Date.now()))
  catalogDb.setMeta("mtg:prices_checked_at", String(Date.now()))
  addCollectionCard(solRing)
  const view = renderCards()
  expect(view.getByText("CMM · #410 · $2.50")).toBeTruthy()

  const fetcher = jest.fn(async (input: string | URL | Request) =>
    String(input).endsWith("/datasets/mtg/prices.json")
      ? new Response(
          JSON.stringify({ version: "v2", asOf: 1_764_000_000_000, prices: { "cmm-410": [300] } }),
          { status: 200 },
        )
      : new Response(null, { status: 304 }),
  ) as unknown as typeof fetch
  await act(() => syncCatalogPrintingsAndPrices("mtg", { fetcher, force: true }))

  expect(view.getByText("CMM · #410 · $3.00")).toBeTruthy()
})

it("holds the list while scanning and refreshes it once when the scanner closes", () => {
  addCollectionCard(solRing)
  const list = jest.spyOn(localCardDb, "listCollectionEntries")
  const collectionLists = () =>
    list.mock.calls.filter(([filter]) => filter?.game === "mtg" && !filter.cardId).length
  try {
    const view = renderCards()
    expect(collectionLists()).toBe(1)

    fireEvent.press(view.getByTestId("collection-scan-button"))
    const [session] = listBinders("scan_session")
    act(() => {
      addCollectionCard({ ...solRing, binderId: session.id })
    })
    expect(collectionLists()).toBe(1)

    fireEvent.press(view.getByTestId("card-scanner-close"))
    expect(collectionLists()).toBe(2)
  } finally {
    list.mockRestore()
  }
})

it("trades only main library copies in the picked condition, and merges colliding edits", () => {
  const scanSession = createBinder({ kind: "scan_session", name: "Temp Scan", game: "mtg" })
  addCollectionCard({ ...solRing, finish: "nonfoil", condition: "LP", quantity: 1 })
  addCollectionCard({
    ...solRing,
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
    ...solRing,
    cardId: "name:sol ring",
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
