import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { PokemonSheet, type PokemonSheetProps } from "./PokemonSheet"

const mockAction = jest.fn()
const mockQuery = jest.fn()
const mockConvex = {
  action: mockAction,
  query: mockQuery,
  connectionState: () => ({ isWebSocketConnected: true }),
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

describe("PokemonSheet", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockAction.mockReset()
    mockQuery.mockReset()
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

  it("types on the in-seat keypad when the seat faces away from the system keyboard", async () => {
    mockAction.mockImplementation((_reference: unknown, args: { query?: string }) =>
      Promise.resolve(args.query ? [hit] : card),
    )
    render(sheet({ rotation: 180 }))
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

    const hp = screen.getByTestId("pokemon-hp-input-seat-1")
    expect(hp.props.inputMode).toBe("none")
    fireEvent(hp, "focus")
    expect(screen.queryByTestId("pokemon-key-q-seat-1")).toBeNull()
    for (const key of ["1", "2", "0", "5"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(screen.getByTestId("pokemon-hp-input-seat-1").props.value).toBe("120")
  })

  it("capitalizes only the first keypad letter, so a typed Mega ex is worth three prizes", () => {
    render(sheet({ rotation: 180 }))
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    for (const key of [..."mega", "space", ..."ab", "space", ..."ex"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Mega ab ex")
    expect(screen.getByTestId("pokemon-prizes-3-seat-1").props.accessibilityState).toMatchObject({
      checked: true,
    })
  })

  it("types punctuation from the keypad's number layer", () => {
    render(sheet({ rotation: 180 }))
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    for (const key of ["h", "o", "numbers", "-", "letters", "shift", "o", "h"])
      fireEvent.press(screen.getByTestId(`pokemon-key-${key}-seat-1`))
    expect(screen.getByTestId("pokemon-name-input-seat-1").props.value).toBe("Ho-Oh")
  })

  it("moves focus to the search field when Look up opens it", () => {
    const pokemon = { id: "active-001", name: "Pikachu", hp: 60, prizes: 1, damage: 0 }
    render(sheet({ rotation: 180, mode: { kind: "edit", pokemon, slot: "active" } }))
    fireEvent(screen.getByTestId("pokemon-name-input-seat-1"), "focus")
    fireEvent.press(screen.getByTestId("pokemon-lookup-seat-1"))
    expect(screen.getByTestId("pokemon-search-seat-1").props.autoFocus).toBe(true)
  })

  it("keeps the system keyboard for a seat facing the bottom edge", () => {
    render(sheet({ rotation: 0 }))
    const search = screen.getByTestId("pokemon-search-seat-1")
    expect(search.props.showSoftInputOnFocus).toBe(true)
    fireEvent(search, "focus")
    expect(screen.queryByTestId("pokemon-keypad-seat-1")).toBeNull()
  })

  it("lists the seat's own deck Pokémon before typing, and places one with a tap", async () => {
    mockQuery.mockResolvedValue([
      { name: "Charizard ex", cardId: "sv03-125", category: "Pokemon", quantity: 2 },
      { name: "Rare Candy", cardId: "sv01-191", category: "Trainer", quantity: 4 },
      { name: "Charizard ex", cardId: "sv03-125", category: "Pokemon", quantity: 1 },
    ])
    mockAction.mockResolvedValue(card)
    const onPlace = jest.fn(() => true)
    render(sheet({ deckVersionId: "version-1", onPlace }))
    await flush()

    expect(screen.getByLabelText("Charizard ex, SV3 125 ×3")).toBeTruthy()
    expect(screen.queryByText("Rare Candy")).toBeNull()
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
})
