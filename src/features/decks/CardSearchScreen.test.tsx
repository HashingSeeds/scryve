import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { ThemeProvider } from "@/theme/context"
import { loadString, remove } from "@/utils/storage"

import { clearCardDetails, saveCardDetails } from "./cardDetailsCache"
import { CardSearchScreen } from "./CardSearchScreen"

const mockDetailsAction = jest.fn()
const mockAction = jest.fn()
const mockQuery = jest.fn()
const mockClient = { action: mockAction, query: mockQuery }
const mockConnection = { isWebSocketConnected: true }
jest.mock("convex/react", () => ({
  useConvex: () => mockClient,
  useAction: () => mockDetailsAction,
  useConvexConnectionState: () => mockConnection,
}))

const eligible = {
  commanderEligibility: "eligible",
  commanderLegality: "legal",
  colorIdentity: "U",
  commanderRulesUpdatedAt: new Date().toISOString(),
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

function chooser(cards = deck, onAdd = jest.fn()) {
  return render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen
        game="mtg"
        format="commander"
        initialSection="commander"
        commanderCards={cards}
        onAdd={onAdd}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  clearCardDetails()
  remove("scryve.cards.keyword-abilities.v1")
  mockDetailsAction.mockResolvedValue({
    ...eligible,
    commanderRulesUpdatedAt: new Date().toISOString(),
  })
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
  await act(async () => {})
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
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
  expect(view.queryByLabelText("Preview Unknown as commander")).toBeNull()
  await waitFor(() => expect(view.getByLabelText("Preview Unknown as commander")).toBeTruthy())
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    scryfallId: "unknown",
    deviceId: expect.any(String),
  })
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
    deviceId: expect.any(String),
    game: "mtg",
    query: "(ar) is:commander f:commander",
  })
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Talrand reprint as commander")).toBeNull()
  expect(view.queryByLabelText("Preview Banned as commander")).toBeNull()
  jest.useRealTimers()
})

it("defaults to the exact selected color for deck and provider results", async () => {
  jest.useFakeTimers()
  saveCardDetails({ talrand: eligible, ring: { ...eligible, colorIdentity: "UB" } })
  mockAction.mockResolvedValue([{ ...searchCard, colorIdentity: "UB" }])
  const view = chooser(deck.slice(0, 2))
  fireEvent.press(view.getByTestId("commander-color-B"))
  expect(view.queryByLabelText("Preview Talrand as commander")).toBeNull()
  expect(view.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
  fireEvent.changeText(view.getByTestId("card-search-input"), "ar")
  await act(async () => {
    jest.advanceTimersByTime(400)
  })
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: '(ar) is:commander f:commander (id=b or o:"choose a color")',
  })
  expect(view.queryByLabelText("Preview Baral as commander")).toBeNull()
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
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(view.queryByText("Unknown")).toBeNull()
  expect(mockQuery).not.toHaveBeenCalled()
  expect(mockAction).not.toHaveBeenCalled()
})

it("keeps required color-choice commanders out of the colorless filter", () => {
  mockConnection.isWebSocketConnected = false
  saveCardDetails({
    talrand: { ...eligible, colorIdentity: "" },
    ring: { ...eligible, commanderEligibility: "color-choice", colorIdentity: "" },
  })
  const view = chooser(deck.slice(0, 2))
  fireEvent.press(view.getByTestId("commander-color-C"))
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
})

afterEach(() => jest.useRealTimers())

it("previews a result without assigning it, preserves search filters on dismiss, and confirms explicitly", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([searchCard])
  const onAdd = jest.fn()
  const view = chooser([], onAdd)
  fireEvent.press(view.getByTestId("commander-color-U"))
  fireEvent.changeText(view.getByTestId("card-search-input"), "ar")
  await act(async () => jest.advanceTimersByTime(400))
  fireEvent.press(view.getByText("Baral"))
  await act(async () => {})
  expect(view.getByTestId("card-focus-dialog")).toBeTruthy()
  expect(onAdd).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("card-focus-backdrop"))
  expect(view.queryByTestId("card-focus-dialog")).toBeNull()
  expect(view.getByTestId("card-search-input").props.value).toBe("ar")
  expect(view.getByTestId("commander-color-U").props.accessibilityState.selected).toBe(true)
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
  fireEvent.press(view.getByLabelText("Preview Baral as commander"))
  await act(async () => {})
  fireEvent.press(view.getByTestId("set-commander"))
  expect(onAdd).toHaveBeenCalledTimes(1)
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Baral",
      scryfallId: "baral",
      quantity: 1,
      section: "commander",
      board: "commander",
    }),
  )
  expect(view.queryByTestId("card-focus-dialog")).toBeNull()
})

it("requires the exact selected identity by default and optionally allows additional colors", async () => {
  jest.useFakeTimers()
  saveCardDetails({
    talrand: eligible,
    ring: { ...eligible, colorIdentity: "UB" },
    unknown: { ...eligible, colorIdentity: "UBR" },
  })
  mockAction.mockImplementation((_ref, args) => Promise.resolve("query" in args ? [] : ["Flying"]))
  const view = chooser()
  fireEvent.press(view.getByTestId("commander-color-U"))
  fireEvent.press(view.getByTestId("commander-color-B"))
  expect(view.queryByLabelText("Preview Talrand as commander")).toBeNull()
  expect(view.getByLabelText("Preview Sol Ring as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Unknown as commander")).toBeNull()
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: 'is:commander f:commander (id=ub or o:"choose a color")',
  })
  fireEvent.press(view.getByTestId("commander-filters-button"))
  await act(async () => {})
  fireEvent.press(view.getByLabelText("Allow additional colors"))
  fireEvent.press(view.getByLabelText("Dismiss commander filters"))
  expect(view.getByLabelText("Preview Sol Ring as commander")).toBeTruthy()
  expect(view.getByLabelText("Preview Unknown as commander")).toBeTruthy()
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: 'is:commander f:commander (id>=ub or o:"choose a color")',
  })
})

it("fetches searchable keyword choices, combines selected keywords, and reuses the catalog offline", async () => {
  jest.useFakeTimers()
  saveCardDetails({
    talrand: { ...eligible, keywords: "Flying\nWard" },
    ring: { ...eligible, keywords: "Flying" },
  })
  mockAction.mockImplementation((_ref, args) =>
    Promise.resolve(
      "query" in args
        ? [{ ...searchCard, keywords: "Flying\nWard" }]
        : ["Flying", "Ward", "Vigilance"],
    ),
  )
  const view = chooser(deck.slice(0, 2))
  fireEvent.press(view.getByTestId("commander-filters-button"))
  await act(async () => {})
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), { deviceId: expect.any(String) })
  expect(JSON.parse(loadString("scryve.cards.keyword-abilities.v1") ?? "null")).toEqual([
    "Flying",
    "Ward",
    "Vigilance",
  ])
  fireEvent.changeText(view.getByLabelText("Search keywords"), "fly")
  expect(view.getByLabelText("Flying")).toBeTruthy()
  expect(view.queryByLabelText("Ward")).toBeNull()
  fireEvent.press(view.getByLabelText("Flying"))
  fireEvent.changeText(view.getByLabelText("Search keywords"), "ward")
  fireEvent.press(view.getByLabelText("Ward"))
  fireEvent.press(view.getByLabelText("Dismiss commander filters"))
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: 'is:commander f:commander kw:"Flying" kw:"Ward"',
  })
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
  view.unmount()
  mockConnection.isWebSocketConnected = false
  mockAction.mockClear()
  mockQuery.mockClear()
  const offlineView = chooser(deck.slice(0, 2))
  fireEvent.press(offlineView.getByTestId("commander-filters-button"))
  fireEvent.press(offlineView.getByLabelText("Ward"))
  fireEvent.press(offlineView.getByLabelText("Dismiss commander filters"))
  expect(offlineView.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(offlineView.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
  expect(mockAction).not.toHaveBeenCalled()
  expect(mockQuery).not.toHaveBeenCalled()
})

it.each(["commander", "main"])(
  "counts down a paused %s search and retries the latest query without requests during cooldown",
  async (section) => {
    jest.useFakeTimers()
    const failure = new ConvexError({
      code: "scryfall_rate_limited",
      message: "Scryfall requests are paused. Try again shortly.",
      retryAfterMs: 3000,
    })
    mockAction.mockRejectedValueOnce(failure).mockResolvedValue([searchCard])
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSearchScreen
          game="mtg"
          format="commander"
          initialSection={section}
          commanderCards={[]}
          onAdd={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    )
    if (section === "commander") fireEvent.press(view.getByTestId("commander-color-U"))
    fireEvent.changeText(view.getByTestId("card-search-input"), "bar")
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByText("Retrying in 3s")).toBeTruthy()
    expect(view.getByTestId("retry-card-search")).toBeDisabled()
    fireEvent.changeText(view.getByTestId("card-search-input"), "baral")
    await act(async () => jest.advanceTimersByTime(1000))
    expect(view.getByText("Retrying in 2s")).toBeTruthy()
    expect(mockAction).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(2000))
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockAction).toHaveBeenCalledTimes(2)
    expect(mockAction).toHaveBeenLastCalledWith(expect.anything(), {
      deviceId: expect.any(String),
      game: "mtg",
      query:
        section === "commander"
          ? '(baral) is:commander f:commander (id=u or o:"choose a color")'
          : "baral",
    })
    expect(view.queryByText(failure.data.message)).toBeNull()
  },
)

it("offers manual retry for search errors without a cooldown", async () => {
  jest.useFakeTimers()
  mockAction.mockRejectedValueOnce(new Error("network failed")).mockResolvedValue([searchCard])
  const view = chooser([])
  fireEvent.changeText(view.getByTestId("card-search-input"), "baral")
  await act(async () => jest.advanceTimersByTime(400))
  expect(view.getByTestId("retry-card-search")).toBeEnabled()
  fireEvent.press(view.getByTestId("retry-card-search"))
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledTimes(2)
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
})

it("counts down a paused eligibility lookup and hydrates after its retry", async () => {
  jest.useFakeTimers()
  mockAction
    .mockRejectedValueOnce(
      new ConvexError({
        code: "scryfall_rate_limited",
        message: "Scryfall requests are paused. Try again shortly.",
        retryAfterMs: 3000,
      }),
    )
    .mockResolvedValue(eligible)
  const view = chooser([deck[2]])
  await act(async () => {})
  expect(view.getByText("Retrying in 3s")).toBeTruthy()
  expect(view.getByTestId("retry-commander-eligibility")).toBeDisabled()
  await act(async () => jest.advanceTimersByTime(1000))
  expect(view.getByText("Retrying in 2s")).toBeTruthy()
  expect(mockAction).toHaveBeenCalledTimes(1)
  await act(async () => jest.advanceTimersByTime(2000))
  expect(mockAction).toHaveBeenCalledTimes(2)
  expect(view.getByLabelText("Preview Unknown as commander")).toBeTruthy()
})

it.each([
  { commanderEligibility: "ineligible", commanderLegality: "legal" },
  { commanderEligibility: "eligible", commanderLegality: "banned" },
])(
  "refreshes expired hidden Commander rules despite a complete expired server batch",
  async (rules) => {
    const expired = {
      ...eligible,
      ...rules,
      commanderRulesUpdatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }
    saveCardDetails({ unknown: expired })
    mockQuery.mockResolvedValue([{ key: "unknown", details: expired }])
    mockAction.mockResolvedValue({ ...eligible, commanderRulesUpdatedAt: new Date().toISOString() })
    const view = chooser([deck[2]])
    expect(view.queryByLabelText("Preview Unknown as commander")).toBeNull()
    await act(async () => {})
    expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {
      game: "mtg",
      items: [{ key: "unknown", scryfallId: "unknown" }],
    })
    expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
      scryfallId: "unknown",
      deviceId: expect.any(String),
    })
    expect(view.getByLabelText("Preview Unknown as commander")).toBeTruthy()
  },
)
