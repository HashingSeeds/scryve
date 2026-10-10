import { act, fireEvent, render, screen } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { PokemonSheet, type PokemonSheetProps } from "./PokemonSheet"

const mockAction = jest.fn()
const mockConvex = {
  action: mockAction,
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
})
