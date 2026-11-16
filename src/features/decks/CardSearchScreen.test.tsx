import { StyleSheet } from "react-native"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"
import type { ReactTestInstance } from "react-test-renderer"

import { colors as darkColors } from "@/theme/colorsDark"
import { ThemeProvider } from "@/theme/context"

import { clearCardDetails, loadCardDetails, saveCardDetails } from "./cardDetailsCache"
import { cardNameIndex, type CardNameIndex } from "./cardNameMatch"
import { CardSearch, CardSearchScreen, scryfallQuery } from "./CardSearchScreen"
import type { DeckCard } from "./deckCards"
import type { KnownCardEntry } from "./deckVersionsCache"
import { parseMagicCards, type MagicCards } from "./localMagicSearch"

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

function barText(view: { getByTestId: (id: string) => ReactTestInstance }) {
  const read = (node: ReactTestInstance | string): string =>
    typeof node === "string" ? node : node.children.map(read).join("")
  return read(view.getByTestId("card-search-input"))
}

let mockNameIndex: CardNameIndex | undefined
jest.mock("./useCardNameIndex", () => ({ useCardNameIndex: () => mockNameIndex }))
let mockMagicCards: MagicCards | undefined
jest.mock("./useMagicCards", () => ({ useMagicCards: () => mockMagicCards }))

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

async function pickColors(view: ReturnType<typeof render>, ...colors: string[]) {
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
  for (const color of colors) fireEvent.press(view.getByTestId(`card-color-${color}`))
  fireEvent.press(view.getByText("Done"))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNameIndex = undefined
  mockMagicCards = undefined
  clearCardDetails()
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

it("matches a quoted commander name in cached cards offline", () => {
  mockConnection.isWebSocketConnected = false
  saveCardDetails({ talrand: eligible })
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen
        game="mtg"
        format="commander"
        initialSection="commander"
        commanderCards={[]}
        offlineCandidates={[{ card: deck[0], game: "mtg" }]}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  fireEvent.changeText(view.getByTestId("card-search-input"), '"Talrand"')
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
})

it("keeps required color-choice commanders out of the colorless filter", async () => {
  mockConnection.isWebSocketConnected = false
  saveCardDetails({
    talrand: { ...eligible, colorIdentity: "" },
    ring: { ...eligible, commanderEligibility: "color-choice", colorIdentity: "" },
  })
  const view = chooser(deck.slice(0, 2))
  await pickColors(view, "C")
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
})

afterEach(() => jest.useRealTimers())

function cardSearch(offlineCandidates?: KnownCardEntry[]) {
  return render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen
        game="mtg"
        format="commander"
        initialSection="main"
        offlineCandidates={offlineCandidates}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
}

it("keeps the last results on screen while the next search is pending", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([searchCard])
  const view = cardSearch()
  fireEvent.changeText(view.getByTestId("card-search-input"), "bar")
  await act(async () => jest.advanceTimersByTime(400))
  expect(view.getByText("Baral")).toBeTruthy()
  fireEvent.changeText(view.getByTestId("card-search-input"), "bara")
  expect(view.getByText("Baral")).toBeTruthy()
  expect(view.getByLabelText("Searching…")).toBeTruthy()
  await act(async () => jest.advanceTimersByTime(400))
  expect(view.queryByLabelText("Searching…")).toBeNull()
})

it("searches within the commander's colors until the player clears them", async () => {
  jest.useFakeTimers()
  saveCardDetails({ talrand: { ...eligible, colorIdentity: "UR" } })
  mockAction.mockResolvedValue([])
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen
        game="mtg"
        format="commander"
        initialSection="main"
        commanderCards={[{ ...deck[0], section: "commander" }, deck[1]]}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />
    </ThemeProvider>,
  )
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).not.toHaveBeenCalled()
  expect(barText(view)).toBe("f:commander id<=ur ")
  fireEvent.changeText(view.getByTestId("card-search-input"), "f:commander id<=ur bolt")
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenLastCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: "(bolt) id<=ur f:commander",
  })
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
  const selected = (color: string) =>
    view.getByTestId(`card-color-${color}`).props.accessibilityState.selected
  expect(["W", "U", "B", "R", "G"].map(selected)).toEqual([false, true, false, true, false])
  fireEvent.press(view.getByText("Clear all"))
  await act(async () => jest.advanceTimersByTime(400))
  expect(selected("U")).toBe(false)
  expect(mockAction).toHaveBeenLastCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: "(bolt) f:commander",
  })
})

it("filters cached cards by color identity offline", async () => {
  mockConnection.isWebSocketConnected = false
  saveCardDetails({
    talrand: eligible,
    ring: { ...eligible, colorIdentity: "" },
    unknown: { ...eligible, commanderEligibility: "color-choice", colorIdentity: "" },
  })
  const view = cardSearch(deck.map((card) => ({ card, game: "mtg" })))
  await pickColors(view, "C")
  expect(view.getByText("Sol Ring")).toBeTruthy()
  expect(view.getByText("Unknown")).toBeTruthy()
  expect(view.queryByText("Talrand")).toBeNull()
  expect(mockAction).not.toHaveBeenCalled()
})

it("previews a result without assigning it, preserves search filters on dismiss, and confirms explicitly", async () => {
  jest.useFakeTimers()
  mockAction.mockImplementation((_ref, args) =>
    Promise.resolve("query" in args ? [searchCard] : ["Flying"]),
  )
  const onAdd = jest.fn()
  const view = chooser([], onAdd)
  await pickColors(view, "U")
  fireEvent.changeText(view.getByTestId("card-search-input"), "f:commander id=u ar")
  await act(async () => jest.advanceTimersByTime(400))
  fireEvent.press(view.getByText("Baral"))
  await act(async () => {})
  expect(view.getByTestId("card-focus-dialog")).toBeTruthy()
  expect(onAdd).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("card-focus-close"))
  expect(view.queryByTestId("card-focus-dialog")).toBeNull()
  expect(barText(view)).toBe("f:commander id=u ar")
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
  mockAction.mockImplementation((_ref, args) =>
    Promise.resolve("query" in args ? [{ ...searchCard, colorIdentity: "UBR" }] : ["Flying"]),
  )
  const view = chooser()
  await pickColors(view, "U", "B")
  expect(view.queryByLabelText("Preview Talrand as commander")).toBeNull()
  expect(view.getByLabelText("Preview Sol Ring as commander")).toBeTruthy()
  expect(view.queryByLabelText("Preview Unknown as commander")).toBeNull()
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: 'is:commander f:commander (id=ub or o:"choose a color")',
  })
  expect(view.queryByLabelText("Preview Baral as commander")).toBeNull()
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
  fireEvent.press(view.getByTestId("card-color-match-additional"))
  fireEvent.press(view.getByLabelText("Dismiss commander filters"))
  expect(view.getByLabelText("Preview Sol Ring as commander")).toBeTruthy()
  expect(view.getByLabelText("Preview Unknown as commander")).toBeTruthy()
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: 'is:commander f:commander (id>=ub or o:"choose a color")',
  })
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
})

it("lists keywords from the card file, combines picked keywords, and works offline", async () => {
  jest.useFakeTimers()
  const bird = (name: string, keywords: string) => ({
    name,
    scryfallId: name,
    oracleId: name,
    commanderEligibility: "ineligible",
    keywords,
  })
  mockMagicCards = parseMagicCards(
    JSON.stringify({
      version: "1",
      cards: [
        bird("Bird A", "Flying\nWard"),
        bird("Bird B", "Flying\nWard"),
        bird("Bird C", "Flying\nWard"),
        bird("Bird D", "Flying"),
        bird("Bird E", "Choose a background"),
      ],
    }),
  )
  saveCardDetails({
    talrand: { ...eligible, keywords: "Flying\nWard" },
    ring: { ...eligible, keywords: "Flying" },
  })
  mockAction.mockImplementation((_ref, args) =>
    Promise.resolve("query" in args ? [{ ...searchCard, keywords: "Flying\nWard" }] : []),
  )
  const view = chooser(deck.slice(0, 2))
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
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
    query: "is:commander f:commander kw:flying kw:ward",
  })
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
  view.unmount()
  mockConnection.isWebSocketConnected = false
  mockAction.mockClear()
  mockQuery.mockClear()
  const offlineView = chooser(deck.slice(0, 2))
  fireEvent.press(offlineView.getByTestId("card-filters-button"))
  fireEvent.press(offlineView.getByLabelText("Ward"))
  fireEvent.press(offlineView.getByLabelText("Dismiss commander filters"))
  expect(offlineView.getByLabelText("Preview Talrand as commander")).toBeTruthy()
  expect(offlineView.queryByLabelText("Preview Sol Ring as commander")).toBeNull()
  expect(mockAction).not.toHaveBeenCalled()
  expect(mockQuery).not.toHaveBeenCalled()
})

it("trusts Scryfall's commander results for a filter the device can't check", async () => {
  jest.useFakeTimers()
  mockAction.mockImplementation((_ref, args) =>
    Promise.resolve("query" in args ? [searchCard] : eligible),
  )
  const view = chooser([])
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
  fireEvent.changeText(view.getByTestId("card-filter-manaValue-min"), "2")
  fireEvent.changeText(view.getByTestId("card-filter-manaValue-max"), "2")
  fireEvent.press(view.getByLabelText("Dismiss commander filters"))
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    deviceId: expect.any(String),
    game: "mtg",
    query: "is:commander f:commander mv>=2 mv<=2",
  })
  expect(view.getByLabelText("Preview Baral as commander")).toBeTruthy()
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
    if (section === "commander") await pickColors(view, "U")
    const filters = section === "commander" ? "f:commander id=u" : "f:commander"
    mockAction.mockClear()
    mockAction.mockRejectedValueOnce(failure).mockResolvedValue([searchCard])
    fireEvent.changeText(view.getByTestId("card-search-input"), `${filters} bar`)
    await act(async () => jest.advanceTimersByTime(400))
    expect(view.getByText("Retrying in 3s")).toBeTruthy()
    expect(view.getByTestId("retry-card-search")).toBeDisabled()
    fireEvent.changeText(view.getByTestId("card-search-input"), `${filters} baral`)
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
          : "(baral) f:commander",
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

it("rechecks only legendary cards once their Commander rules expire", async () => {
  const expired = {
    ...eligible,
    commanderEligibility: "ineligible",
    commanderRulesUpdatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  }
  saveCardDetails({
    talrand: { ...expired, typeLine: "Legendary Creature — Human Wizard" },
    ring: { ...expired, typeLine: "Artifact" },
  })
  mockAction.mockResolvedValue({ ...eligible, typeLine: "Legendary Creature — Human Wizard" })
  const view = chooser(deck.slice(0, 2))
  await act(async () => {})
  expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {
    game: "mtg",
    items: [{ key: "talrand", scryfallId: "talrand" }],
  })
  expect(mockAction).toHaveBeenCalledTimes(1)
  expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
    scryfallId: "talrand",
    deviceId: expect.any(String),
  })
  expect(view.getByLabelText("Preview Talrand as commander")).toBeTruthy()
})

const filters: Parameters<typeof scryfallQuery>[0] = {
  text: "",
  commander: false,
  colors: [],
  colorMatch: "exact",
  filters: {},
}

it.each<[string, Partial<typeof filters>, string]>([
  ["plain text", { text: "bar" }, "bar"],
  ["colors alone", { colors: ["U", "B"] }, "id=ub"],
  [
    "text with additional colors allowed",
    { text: 'o:"draw a card" or t:wizard', colors: ["U", "B"], colorMatch: "additional" },
    '(o:"draw a card" or t:wizard) id>=ub',
  ],
  ["colors within a commander's identity", { colors: ["U", "R"], colorMatch: "within" }, "id<=ur"],
  ["colorless", { text: "sol", colors: ["C", "U"] }, "(sol) id:c"],
  ["a commander name", { text: "ar", commander: true }, "(ar) is:commander f:commander"],
  [
    "commander colors exactly",
    { commander: true, colors: ["U", "B"] },
    'is:commander f:commander (id=ub or o:"choose a color")',
  ],
  [
    "commander colors or more",
    { commander: true, colors: ["U", "B"], colorMatch: "additional" },
    'is:commander f:commander (id>=ub or o:"choose a color")',
  ],
  ["colorless commanders", { commander: true, colors: ["C"] }, "is:commander f:commander id:c"],
  [
    "keywords with quotes and backslashes stripped",
    { commander: true, filters: { keyword: ["Flying", 'W"a\\rd'] } },
    "is:commander f:commander kw:flying kw:ward",
  ],
  [
    "any of the picked types, every picked supertype, and a mana value range",
    {
      filters: {
        type: ["Creature", "Artifact"],
        supertype: ["Legendary"],
        manaValue: [">=2", "<=4"],
      },
    },
    "t:legendary (t:creature or t:artifact) mv>=2 mv<=4",
  ],
  [
    "a minimum power and a maximum toughness",
    { filters: { power: [">=4"], toughness: ["<=5"] } },
    "pow>=4 tou<=5",
  ],
  [
    "every picked format",
    { text: "bolt", filters: { format: ["modern", "legacy"] } },
    "(bolt) f:modern f:legacy",
  ],
  [
    "a commander pick, legal once",
    { text: "ar", commander: true, filters: { format: ["commander"] } },
    "(ar) is:commander f:commander",
  ],
  [
    "a long commander name, cut to 80 characters without quotes or parentheses",
    { text: `"Talrand" (${"x".repeat(100)})`, commander: true },
    `(Talrand   ${"x".repeat(69)}) is:commander f:commander`,
  ],
  ["a one-letter commander name", { text: "a", commander: true }, "is:commander f:commander"],
])("builds the Scryfall query for %s", (_name, input, expected) => {
  expect(scryfallQuery({ ...filters, ...input })).toBe(expected)
})

describe("with the device's card name list", () => {
  const bolt = { ...searchCard, name: "Lightning Bolt", scryfallId: "bolt", colorIdentity: "R" }
  const blow = { ...searchCard, name: "Lightning Blow", scryfallId: "blow", colorIdentity: "W" }
  const axe = { ...searchCard, name: "Lightning Axe", scryfallId: "axe", colorIdentity: "R" }

  function adder(format = "constructed") {
    mockNameIndex = cardNameIndex(["Lightning Axe", "Lightning Blow", "Lightning Bolt"])
    mockAction.mockImplementation(async (_action, args: { names?: string[] }) =>
      args.names ? { cards: [blow, bolt], lookupFailed: false } : [axe, bolt],
    )
    return render(
      <ThemeProvider initialContext="dark">
        <CardSearchScreen game="mtg" format={format} onAdd={jest.fn()} onClose={jest.fn()} />
      </ThemeProvider>,
    )
  }

  async function search(view: ReturnType<typeof adder>, text: string) {
    jest.useFakeTimers()
    fireEvent.changeText(view.getByTestId("card-search-input"), text)
    await act(async () => jest.advanceTimersByTime(400))
    jest.useRealTimers()
    return view.getAllByLabelText(/^Add .* to deck$/).map((row) => row.props.accessibilityLabel)
  }

  it("leads with the closest names to a misspelled query, then Scryfall's results", async () => {
    const view = adder()
    expect(await search(view, "lightnig bolt")).toEqual([
      "Add Lightning Bolt to deck",
      "Add Lightning Blow to deck",
      "Add Lightning Axe to deck",
    ])
    expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
      names: ["Lightning Bolt", "Lightning Blow", "Lightning Axe"],
      deviceId: expect.any(String),
    })
  })

  it("drops name matches whose legality in the deck's format the device can't confirm", async () => {
    const view = adder("modern")
    expect(await search(view, "f:modern lightnig bolt")).toEqual([
      "Add Lightning Axe to deck",
      "Add Lightning Bolt to deck",
    ])
  })

  it("keeps name matches to the picked colors", async () => {
    const view = adder()
    await pickColors(view, "R")
    expect(await search(view, "id=r lightnig bolt")).toEqual([
      "Add Lightning Bolt to deck",
      "Add Lightning Axe to deck",
    ])
  })

  it.each(["lightning bolt and zzzz", "lightning OR bolt", "-t:instant lightning"])(
    "leaves Scryfall syntax like %s to Scryfall",
    async (text) => {
      const view = adder()
      await search(view, text)
      expect(mockAction).toHaveBeenCalledTimes(1)
    },
  )
})

describe("with the device's Magic card file", () => {
  const { commanderRulesUpdatedAt: _, ...withoutRules } = searchCard
  const shivan = {
    ...withoutRules,
    name: "Shivan Dragon",
    scryfallId: "shivan",
    colorIdentity: "R",
    typeLine: "Creature — Dragon",
    legalFormats: ["modern"],
  }

  async function searchFor(text: string) {
    mockMagicCards = parseMagicCards(JSON.stringify({ version: "1", cards: [shivan] }))
    const onAdd = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSearchScreen game="mtg" format="modern" onAdd={onAdd} onClose={jest.fn()} />
      </ThemeProvider>,
    )
    jest.useFakeTimers()
    fireEvent.changeText(view.getByTestId("card-search-input"), `f:modern ${text}`)
    await act(async () => jest.advanceTimersByTime(400))
    jest.useRealTimers()
    return { view, onAdd }
  }

  it("answers on the device, and an added card fetches its rules text", async () => {
    mockAction.mockResolvedValue({
      ...shivan,
      oracleText: "Flying",
      commanderRulesUpdatedAt: "now",
    })
    const { view, onAdd } = await searchFor("dragon")
    fireEvent.press(view.getByLabelText("Add Shivan Dragon to deck"))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ scryfallId: "shivan" }))
    expect(mockAction).toHaveBeenCalledTimes(1)
    expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
      scryfallId: "shivan",
      deviceId: expect.any(String),
    })
    await waitFor(() => expect(loadCardDetails().shivan?.oracleText).toBe("Flying"))
  })

  it("asks Scryfall for a name the device's file doesn't have yet", async () => {
    mockAction.mockResolvedValue([])
    await searchFor("Ancestral")
    expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
      game: "mtg",
      deviceId: expect.any(String),
      query: "(Ancestral) f:modern",
    })
  })

  it("waits out a pause when a name the file lacks gets rate limited", async () => {
    mockAction.mockRejectedValue(
      new ConvexError({
        code: "scryfall_rate_limited",
        message: "Scryfall requests are paused. Try again shortly.",
        retryAfterMs: 3000,
      }),
    )
    const { view } = await searchFor("Ancestral")
    jest.useFakeTimers()
    await act(async () => jest.advanceTimersByTime(1500))
    jest.useRealTimers()
    expect(view.getByText(/Retrying in/)).toBeTruthy()
    expect(mockAction).toHaveBeenCalledTimes(1)
  })

  it("keeps a card's saved rules text when its device-file copy is added", async () => {
    saveCardDetails({
      shivan: { ...shivan, oracleText: "Flying", commanderRulesUpdatedAt: "now" },
    })
    const { view } = await searchFor("dragon")
    fireEvent.press(view.getByLabelText("Add Shivan Dragon to deck"))
    expect(loadCardDetails().shivan?.oracleText).toBe("Flying")
    expect(mockAction).not.toHaveBeenCalled()
  })

  it("suggests how to finish a term while the player types it", async () => {
    const { view } = await searchFor("")
    const input = view.getByTestId("card-search-input")
    fireEvent.changeText(input, "f:modern t:dra")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    expect(mockAction).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("card-search-suggestion-t:dragon"))
    expect(barText(view)).toBe("f:modern t:dragon ")
    expect(view.queryByTestId("card-search-suggestion-t:dragon")).toBeNull()
  })

  it("answers syntax it can read on the device", async () => {
    const { view } = await searchFor("t:dragon")
    expect(view.getByLabelText("Add Shivan Dragon to deck")).toBeTruthy()
    expect(mockAction).not.toHaveBeenCalled()
  })

  it("looks up rules on the device offline, and says which syntax needs a connection", async () => {
    mockConnection.isWebSocketConnected = false
    mockMagicCards = parseMagicCards(JSON.stringify({ version: "1", cards: [shivan] }))
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSearch game="mtg" format="modern" onClose={jest.fn()} />
      </ThemeProvider>,
    )
    const input = view.getByTestId("card-search-input")
    fireEvent.changeText(input, "t:dragon")
    expect(await view.findByLabelText("Show Shivan Dragon")).toBeTruthy()
    expect(view.getByText("You’re offline. Searching the card list on this device.")).toBeTruthy()
    fireEvent.changeText(input, "t:dragon o:flying")
    expect(
      await view.findByText("You’re offline. Some of these search terms need a connection."),
    ).toBeTruthy()
    expect(view.queryByLabelText("Show Shivan Dragon")).toBeNull()
    expect(mockAction).not.toHaveBeenCalled()
  })

  it("says a format needs a connection offline when the card file predates legality", async () => {
    mockConnection.isWebSocketConnected = false
    const { legalFormats: _, ...unknownLegality } = shivan
    mockMagicCards = parseMagicCards(JSON.stringify({ version: "1", cards: [unknownLegality] }))
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSearch game="mtg" format="modern" onClose={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent.changeText(view.getByTestId("card-search-input"), "f:modern dragon")
    expect(
      await view.findByText("You’re offline. Some of these search terms need a connection."),
    ).toBeTruthy()
  })

  it("sends syntax the device can't read to Scryfall", async () => {
    mockAction.mockResolvedValue([])
    await searchFor("o:flying")
    expect(mockAction).toHaveBeenCalledWith(expect.anything(), {
      game: "mtg",
      deviceId: expect.any(String),
      query: "(o:flying) f:modern",
    })
  })
})

it("starts a deck's search on its format and lets the player pick other formats or none", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([])
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen game="mtg" format="modern" onAdd={jest.fn()} onClose={jest.fn()} />
    </ThemeProvider>,
  )
  const lastQuery = async () => {
    await act(async () => jest.advanceTimersByTime(400))
    return mockAction.mock.lastCall?.[1].query
  }
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
  expect(view.getByTestId("card-filter-format-modern").props.accessibilityState.selected).toBe(true)
  expect(view.getByText("Pauper")).toBeTruthy()
  fireEvent.changeText(view.getByTestId("card-filter-manaValue-min"), "2")
  fireEvent.changeText(view.getByTestId("card-filter-manaValue-min"), "")
  expect(await lastQuery()).toBeUndefined()
  fireEvent.press(view.getByTestId("card-filter-type-Creature"))
  expect(await lastQuery()).toBe("f:modern t:creature")
  expect(barText(view)).toBe("f:modern t:creature ")
  fireEvent.press(view.getByTestId("card-filter-format-legacy"))
  expect(await lastQuery()).toBe("f:modern f:legacy t:creature")
  fireEvent.press(view.getByTestId("card-filter-format-modern"))
  fireEvent.press(view.getByTestId("card-filter-format-legacy"))
  fireEvent.press(view.getByText("Done"))
  expect(await lastQuery()).toBe("t:creature")
})

it("lights up the filters a player types as syntax", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([])
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearchScreen game="mtg" format="modern" onAdd={jest.fn()} onClose={jest.fn()} />
    </ThemeProvider>,
  )
  fireEvent.changeText(view.getByTestId("card-search-input"), "f:modern t:creature mv<=2 bolt")
  await act(async () => jest.advanceTimersByTime(400))
  expect(mockAction.mock.lastCall?.[1].query).toBe("(bolt) f:modern t:creature mv<=2")
  fireEvent.press(view.getByTestId("card-filters-button"))
  await act(async () => {})
  expect(view.getByTestId("card-filter-type-Creature").props.accessibilityState.selected).toBe(true)
  expect(view.getByTestId("card-filter-manaValue-max").props.value).toBe("2")
  const color = (text: string) => StyleSheet.flatten(view.getByText(text).props.style).color
  expect(color("t:creature")).toBe(color("Type"))
  expect(color("Creature")).toBe(color("Type"))
  expect(color("mv<=2")).toBe(color("Mana value"))
  expect(color("t:creature")).not.toBe(color("mv<=2"))
  expect(color("bolt")).toBe(darkColors.text)
  fireEvent.press(view.getByTestId("card-filter-type-Creature"))
  expect(barText(view)).toBe("f:modern mv<=2 bolt")
})

it("looks cards up without a deck: no adding, and a tapped card opens its sheet", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([{ ...searchCard, oracleText: "Counterspells cost less." }])
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardSearch game="mtg" format="commander" presentation="screen" onClose={jest.fn()} />
    </ThemeProvider>,
  )
  expect(view.getByText("Cards")).toBeTruthy()
  expect(view.queryByText("Add to")).toBeNull()
  fireEvent.changeText(view.getByTestId("card-search-input"), "baral")
  await act(async () => jest.advanceTimersByTime(400))
  jest.useRealTimers()
  expect(view.queryByLabelText("Add Baral to deck")).toBeNull()
  expect(mockAction).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ query: "baral" }),
  )
  fireEvent.press(view.getByLabelText("Show Baral"))
  await waitFor(() => expect(view.getByTestId("card-focus-image")).toBeTruthy())
  expect(view.queryByTestId("set-commander")).toBeNull()
  expect(view.queryByTestId("card-focus-quantity")).toBeNull()
})

describe("adding into a deck's draft", () => {
  async function searchDeck(props: { game: string; format: string; deckCards: DeckCard[] }) {
    const onAdd = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <CardSearch {...props} presentation="screen" onAdd={onAdd} onClose={jest.fn()} />
      </ThemeProvider>,
    )
    jest.useFakeTimers()
    fireEvent.changeText(view.getByTestId("card-search-input"), "is")
    await act(async () => jest.advanceTimersByTime(400))
    jest.useRealTimers()
    return { view, onAdd }
  }

  it("adds a Magic result to Main or Side without a section picker, and lists deck matches", async () => {
    mockAction.mockResolvedValue([{ ...searchCard, name: "Isochron Scepter", scryfallId: "iso" }])
    const island = { name: "Island", quantity: 2, scryfallId: "island", section: "main" }
    const { view, onAdd } = await searchDeck({
      game: "mtg",
      format: "modern",
      deckCards: [island],
    })

    expect(view.queryByTestId("card-search-section")).toBeNull()
    fireEvent.press(view.getByLabelText("Add Isochron Scepter to deck"))
    fireEvent.press(view.getByLabelText("Add Isochron Scepter to Sideboard"))
    expect(view.getByText("In this deck")).toBeTruthy()
    expect(view.getByText("2 in Main deck")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Add another Island"))
    expect(onAdd.mock.calls.map(([card]) => [card.name, card.section, card.quantity])).toEqual([
      ["Isochron Scepter", "main", 1],
      ["Isochron Scepter", "sideboard", 1],
      ["Island", "main", 1],
    ])
  })

  it("keeps the section picker where Main and Side do not reach every section", async () => {
    mockAction.mockResolvedValue([
      { game: "ygo", cardId: "dragon", name: "Isolde", typeLabel: "Fusion Monster" },
    ])
    const { view, onAdd } = await searchDeck({ game: "ygo", format: "advanced", deckCards: [] })

    fireEvent.press(view.getByTestId("card-search-section"))
    await waitFor(() => expect(view.getByTestId("card-search-section-option-extra")).toBeTruthy())
    fireEvent.press(view.getByTestId("card-search-section-option-extra"))
    fireEvent.press(view.getByLabelText("Add Isolde to deck"))
    fireEvent.press(view.getByLabelText("Add Isolde to Side Deck"))
    expect(onAdd.mock.calls.map(([card]) => card.section)).toEqual(["extra", "side"])
  })

  it("keeps the picker for Brawl, whose Commander has no commander flow", async () => {
    mockAction.mockResolvedValue([])
    const { view } = await searchDeck({ game: "mtg", format: "brawl", deckCards: [] })

    fireEvent.press(view.getByTestId("card-search-section"))
    await waitFor(() =>
      expect(view.getByTestId("card-search-section-option-commander")).toBeTruthy(),
    )
  })
})
