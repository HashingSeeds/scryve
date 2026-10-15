import { AccessibilityInfo } from "react-native"
import * as Haptics from "expo-haptics"
import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { DeckVersionCacheRepository } from "@/features/decks/deckVersionsCache"
import { ThemeProvider } from "@/theme/context"
import { resetReducedMotionCacheForTests } from "@/utils/useReducedMotion"

import { keypadBesideForm, PokemonSheet, type PokemonSheetProps } from "./PokemonSheet"

const mockAction = jest.fn()
const mockQuery = jest.fn()
let mockOnline = true
const mockConvex = {
  url: "https://test.convex.cloud",
  action: mockAction,
  query: mockQuery,
  connectionState: () => ({ isWebSocketConnected: mockOnline }),
  subscribeToConnectionState: () => () => {},
}
jest.mock("convex/react", () => ({ useConvex: () => mockConvex }))

const hit = { game: "pokemon", cardId: "sv03-125", name: "Charizard ex", facets: [] }
const card = {
  ...hit,
  facets: [{ key: "hp", value: "330" }],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function sheet(props: Partial<PokemonSheetProps> = {}) {
  return (
    <ThemeProvider initialContext="dark">
      <PokemonSheet
        seatNumber={1}
        color="#41476E"
        rotation={0}
        cardWidth={390}
        cardHeight={400}
        insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        clearance={{ top: 0, left: 0, right: 0 }}
        damageStep={10}
        mode={{ kind: "place", slot: "active" }}
        onPlace={jest.fn(() => true)}
        onUpdate={jest.fn(() => true)}
        onDamage={jest.fn()}
        onMakeActive={jest.fn()}
        onKnockOut={jest.fn()}
        onRemove={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  )
}

const flush = () => act(() => Promise.resolve())
const typeItIn = () => fireEvent.press(screen.getByTestId("pokemon-type-in-seat-1"))

describe("keypadBesideForm", () => {
  it("puts the keypad beside the form on a five-player sideways seat, too short to stack them", () => {
    expect(keypadBesideForm({ width: 300, height: 194 }, 182, true)).toBe(true)
    expect(keypadBesideForm({ width: 390, height: 400 }, 380)).toBe(false)
  })
})

describe("PokemonSheet", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockAction.mockReset()
    mockQuery.mockReset()
    mockOnline = true
  })
  afterEach(() => jest.useRealTimers())

  it("ignores a catalog pick that resolves after the sheet was dismissed", async () => {
    const lookup = deferred<typeof card>()
    mockAction.mockImplementation((_reference: unknown, args: { query?: string }) =>
      args.query ? Promise.resolve([hit]) : lookup.promise,
    )
    const onPlace = jest.fn(() => true)
    const onClose = jest.fn()
    const view = render(sheet({ onPlace, onClose }))

    fireEvent.changeText(screen.getByTestId("pokemon-search-seat-1"), "Charizard")
    act(() => jest.advanceTimersByTime(350))
    await flush()
    fireEvent.press(screen.getByTestId("pokemon-result-sv03-125"))
    fireEvent.press(screen.getByTestId("pokemon-sheet-done-seat-1"))
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()

    await act(async () => {
      lookup.resolve(card)
      await Promise.resolve()
    })
    expect(onPlace).not.toHaveBeenCalled()
  })

  it("places straight from a catalog pick, and keeps the draft when the board refuses", async () => {
    mockAction.mockImplementation((_reference: unknown, args: { query?: string }) =>
      Promise.resolve(args.query ? [hit] : card),
    )
    const onPlace = jest.fn(() => false)
    render(sheet({ onPlace }))

    fireEvent.changeText(screen.getByTestId("pokemon-search-seat-1"), "Charizard")
    act(() => jest.advanceTimersByTime(350))
    await flush()
    fireEvent.press(screen.getByTestId("pokemon-result-sv03-125"))
    await flush()
    await flush()

    expect(onPlace).toHaveBeenCalledWith({
      cardId: "sv03-125",
      name: "Charizard ex",
      hp: 330,
      prizes: 2,
    })
    for (const [, args] of mockAction.mock.calls)
      expect(args).toMatchObject({ deviceId: expect.any(String) })
    expect(screen.getByText("Could not place it. Try again.")).toBeTruthy()
    expect(screen.getByTestId("pokemon-hp-input-seat-1").props.value).toBe("330")
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Charizard ex")
  })

  it("keeps an HP edit open when it would leave the Pokémon at or below its damage", () => {
    const onUpdate = jest.fn(() => false)
    const onClose = jest.fn()
    const pokemon = { id: "active-001", name: "Charizard ex", hp: 330, prizes: 2, damage: 120 }
    render(sheet({ mode: { kind: "edit", pokemon, slot: "active" }, onUpdate, onClose }))

    fireEvent.changeText(screen.getByTestId("pokemon-hp-input-seat-1"), "120")
    fireEvent.press(screen.getByTestId("pokemon-sheet-done-seat-1"))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText("HP must be above the damage on it.")).toBeTruthy()

    fireEvent.changeText(screen.getByTestId("pokemon-hp-input-seat-1"), "130")
    fireEvent.press(screen.getByTestId("pokemon-sheet-done-seat-1"))
    expect(onUpdate).toHaveBeenCalledWith("active-001", {
      name: "Charizard ex",
      hp: 130,
      prizes: 2,
    })
    expect(screen.getByText("Could not save it. Try again.")).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("types on the in-seat keypad instead of the system keyboard", async () => {
    mockAction.mockImplementation((_reference: unknown, args: { query?: string }) =>
      Promise.resolve(args.query ? [hit] : card),
    )
    render(sheet())
    const search = screen.getByTestId("pokemon-search-seat-1")
    expect(search.props.showSoftInputOnFocus).toBe(false)

    fireEvent(search, "focus")
    for (const key of ["c", "h", "a"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    fireEvent.press(screen.getByTestId("pokemon-key-delete-seat-1"))
    expect(search.props.value).toBe("Ch")
    act(() => jest.advanceTimersByTime(350))
    await flush()
    expect(screen.getByTestId("pokemon-result-sv03-125")).toBeTruthy()

    typeItIn()
    const hp = screen.getByTestId("pokemon-hp-input-seat-1")
    expect(hp.props.inputMode).toBe("none")
    fireEvent(hp, "focus")
    expect(screen.queryByTestId("pokemon-key-q-seat-1")).toBeNull()
    for (const key of ["1", "2", "0", "5"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(screen.getByTestId("pokemon-hp-input-seat-1").props.value).toBe("120")
  })

  it("capitalizes only the first keypad letter, so a typed Mega ex is worth three prizes", () => {
    render(sheet())
    typeItIn()
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    for (const key of [..."mega", "space", ..."ab", "space", ..."ex"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Mega ab ex")
    expect(screen.getByTestId("pokemon-prizes-3-seat-1").props.accessibilityState).toMatchObject({
      checked: true,
    })
  })

  it("ticks a haptic for each keypad press once Reduce Motion is known to be off", async () => {
    jest.mocked(Haptics.selectionAsync).mockClear()
    render(sheet())
    typeItIn()
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    fireEvent.press(screen.getByTestId("pokemon-key-a-seat-1"))
    expect(Haptics.selectionAsync).not.toHaveBeenCalled()

    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    resetReducedMotionCacheForTests()
    screen.unmount()
    render(sheet())
    typeItIn()
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    await flush()
    for (const key of ["a", "shift", "delete"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3)
    jest.restoreAllMocks()
    resetReducedMotionCacheForTests()
  })

  it("types punctuation from the keypad's number layer", () => {
    render(sheet())
    typeItIn()
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    for (const key of ["h", "o", "numbers", "-", "letters", "shift", "o", "h"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Ho-Oh")
  })

  it("moves focus to the search field when Look up opens it", () => {
    const pokemon = { id: "active-001", name: "Pikachu", hp: 60, prizes: 1, damage: 0 }
    render(sheet({ mode: { kind: "edit", pokemon, slot: "active" } }))
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    fireEvent.press(screen.getByTestId("pokemon-lookup-seat-1"))
    expect(screen.getByTestId("pokemon-search-seat-1").props.autoFocus).toBe(true)
  })

  it("lists the seat's own deck Pokémon before typing, and places one with a tap", async () => {
    mockQuery.mockResolvedValue({
      revision: 1,
      cards: [
        { name: "Charizard ex", cardId: "sv03-125", category: "Pokemon", quantity: 2 },
        { name: "Rare Candy", cardId: "sv01-191", category: "Trainer", quantity: 4 },
        { name: "Charizard ex", cardId: "sv03-125", category: "Pokemon", quantity: 1 },
      ],
    })
    mockAction.mockResolvedValue(card)
    const onPlace = jest.fn(() => true)
    render(sheet({ deck: { ownerId: "owner-1", versionId: "version-1" }, onPlace }))
    await flush()

    expect(screen.getByLabelText("Charizard ex, SV3 125 ×3")).toBeTruthy()
    expect(screen.queryByText("Rare Candy")).toBeNull()
    expect(
      new DeckVersionCacheRepository("owner-1", undefined, mockConvex.url).loadCards("version-1")
        ?.cards,
    ).toHaveLength(3)
    fireEvent.press(screen.getByTestId("pokemon-result-sv03-125"))
    await flush()
    await flush()
    expect(onPlace).toHaveBeenCalledWith({
      cardId: "sv03-125",
      name: "Charizard ex",
      hp: 330,
      prizes: 2,
    })
  })

  it("hides the typed form while searching, and Type it in carries the query into Name", async () => {
    mockQuery.mockResolvedValue({
      revision: 1,
      cards: [{ name: "Pikachu", cardId: "sv01-063", category: "Pokemon", quantity: 4 }],
    })
    render(sheet({ deck: { ownerId: "owner-1", versionId: "version-1" } }))
    await flush()

    expect(screen.getByTestId("pokemon-result-sv01-063")).toBeTruthy()
    for (const field of ["pokemon-name-input-seat-1", "pokemon-hp-input-seat-1"])
      expect(screen.queryByTestId(field)).toBeNull()

    fireEvent.changeText(screen.getByTestId("pokemon-search-seat-1"), "Pikachu ex")
    typeItIn()
    expect(screen.queryByTestId("pokemon-search-seat-1")).toBeNull()
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Pikachu ex")
    expect(screen.getByTestId("pokemon-prizes-2-seat-1").props.accessibilityState).toMatchObject({
      checked: true,
    })
  })

  it("keeps a half-typed Pokémon on screen when the connection comes back", () => {
    mockOnline = false
    const view = render(sheet())
    fireEvent.changeText(screen.getByTestId("pokemon-name-input-seat-1"), "Pikachu")

    mockOnline = true
    view.rerender(sheet())
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Pikachu")
  })

  it("trims a long search to the name limit when typing it in", () => {
    render(sheet())
    fireEvent.changeText(screen.getByTestId("pokemon-search-seat-1"), "a".repeat(120))
    typeItIn()
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toHaveLength(100)
  })

  it("lists a cached deck offline, and a tap fills the name so only HP is left", async () => {
    mockOnline = false
    mockQuery.mockRejectedValue(new Error("offline"))
    mockAction.mockRejectedValue(new Error("offline"))
    new DeckVersionCacheRepository("owner-offline", undefined, mockConvex.url).saveCards(
      "version-offline",
      1,
      [{ name: "Pikachu ex", cardId: "sv08-057", category: "pokemon", quantity: 2 }],
    )
    render(sheet({ deck: { ownerId: "owner-offline", versionId: "version-offline" } }))
    expect(screen.getByTestId("pokemon-search-seat-1")).toBeTruthy()

    fireEvent.press(screen.getByTestId("pokemon-result-sv08-057"))
    await flush()
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Pikachu ex")
    expect(screen.getByTestId("pokemon-hp-input-seat-1").props.value).toBe("")
    expect(screen.getByTestId("pokemon-prizes-2-seat-1").props.accessibilityState).toMatchObject({
      checked: true,
    })
  })
})
