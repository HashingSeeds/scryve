import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { clearCardDetails, saveCardDetails } from "./cardDetailsCache"
import { CardSearchScreen } from "./CardSearchScreen"

const mockAction = jest.fn()
const mockQuery = jest.fn()
const mockClient = { action: mockAction, query: mockQuery }
const mockConnection = { isWebSocketConnected: true }
jest.mock("convex/react", () => ({
  useConvex: () => mockClient,
  useConvexConnectionState: () => mockConnection,
}))

const eligible = {
  commanderEligibility: "eligible",
  commanderLegality: "legal",
  colorIdentity: "U",
}
const deck = [
  { name: "Talrand", quantity: 1, scryfallId: "talrand", oracleId: "talrand-oracle" },
  { name: "Sol Ring", quantity: 1, scryfallId: "ring" },
  { name: "Unknown", quantity: 1, scryfallId: "unknown" },
]
const searchCard = {
  ...eligible,
  name: "Baral",
  scryfallId: "baral",
  oracleId: "baral-oracle",
  typeLine: "Legendary Creature",
}

function chooser(cards = deck) {
  return render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen
        game="mtg"
        format="commander"
        initialSection="commander"
        commanderCards={cards}
        onChooseCommander={jest.fn()}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  clearCardDetails()
  mockConnection.isWebSocketConnected = true
  mockQuery.mockResolvedValue([])
  mockAction.mockResolvedValue({
    commanderEligibility: "ineligible",
    commanderLegality: "legal",
    colorIdentity: "",
  })
})

it("hides unknown, ineligible, and banned deck cards and hydrates eligibility", async () => {
  saveCardDetails({
    talrand: eligible,
    ring: { commanderEligibility: "ineligible", commanderLegality: "legal" },
  })
  mockQuery.mockResolvedValue([
    { key: "unknown", details: { ...eligible, commanderLegality: "banned" } },
  ])
  const view = chooser()
  expect(view.getByLabelText("Choose Talrand as commander")).toBeTruthy()
  expect(view.queryByLabelText("Choose Sol Ring as commander")).toBeNull()
  expect(view.queryByText("Unknown")).toBeNull()
  expect(view.queryByText("Check eligibility")).toBeNull()
  expect(view.queryByText("Add to")).toBeNull()
  await waitFor(() => expect(view.queryByText("Checking commander eligibility…")).toBeNull())
  expect(view.queryByText("Unknown")).toBeNull()
})

it("refreshes old metadata and reveals eligible deck cards without listing unknown cards first", async () => {
  saveCardDetails({ unknown: { typeLine: "Legendary Creature" } })
  mockAction.mockResolvedValue(eligible)
  const view = chooser([deck[2]])
  expect(view.queryByLabelText("Choose Unknown as commander")).toBeNull()
  await waitFor(() => expect(view.getByLabelText("Choose Unknown as commander")).toBeTruthy())
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), { scryfallId: "unknown" })
})

it("searches Scryfall for legal commanders beyond the cache and removes deck duplicates", async () => {
  jest.useFakeTimers()
  saveCardDetails({ talrand: eligible })
  mockAction.mockResolvedValue([
    searchCard,
    { ...searchCard, name: "Talrand reprint", oracleId: "talrand-oracle" },
    { ...searchCard, name: "Banned", commanderLegality: "banned" },
  ])
  const view = chooser([deck[0]])
  fireEvent.changeText(view.getByTestId("card-search-input"), "ar")
  await act(async () => {
    jest.advanceTimersByTime(400)
  })
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    game: "mtg",
    query: "(ar) is:commander f:commander",
  })
  expect(view.getByLabelText("Add Baral to deck")).toBeTruthy()
  expect(view.queryByLabelText("Add Talrand reprint to deck")).toBeNull()
  expect(view.queryByLabelText("Add Banned to deck")).toBeNull()
  jest.useRealTimers()
})

it("applies the selected color to deck cards and the Scryfall query, including multicolor cards", async () => {
  jest.useFakeTimers()
  saveCardDetails({ talrand: eligible, ring: { ...eligible, colorIdentity: "UB" } })
  mockAction.mockResolvedValue([{ ...searchCard, colorIdentity: "UB" }])
  const view = chooser(deck.slice(0, 2))
  fireEvent.press(view.getByTestId("commander-color-filter"))
  fireEvent.press(view.getByTestId("commander-color-filter-option-B"))
  expect(view.queryByLabelText("Choose Talrand as commander")).toBeNull()
  expect(view.getByLabelText("Choose Sol Ring as commander")).toBeTruthy()
  fireEvent.changeText(view.getByTestId("card-search-input"), "ar")
  await act(async () => {
    jest.advanceTimersByTime(400)
  })
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    game: "mtg",
    query: '(ar) is:commander f:commander (id>=b or o:"choose a color")',
  })
  expect(view.getByLabelText("Add Baral to deck")).toBeTruthy()
  jest.useRealTimers()
})

it("uses only cached eligible cards offline without provider requests", () => {
  mockConnection.isWebSocketConnected = false
  saveCardDetails({ talrand: eligible })
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen
        game="mtg"
        format="commander"
        initialSection="commander"
        commanderCards={deck}
        offlineCandidates={[]}
        onChooseCommander={jest.fn()}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(view.getByLabelText("Choose Talrand as commander")).toBeTruthy()
  expect(view.queryByText("Unknown")).toBeNull()
  expect(mockQuery).not.toHaveBeenCalled()
  expect(mockAction).not.toHaveBeenCalled()
})
