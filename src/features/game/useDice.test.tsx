import { AccessibilityInfo, Platform } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { DiceSeatOverlay } from "@/components/DiceSeatOverlay"
import { DiceStrip } from "@/components/DiceStrip"
import { ThemeProvider } from "@/theme/context"
import * as reducedMotion from "@/utils/useReducedMotion"

import { asPlayerId } from "./domain"
import type { GamePlayer } from "./types"
import { useDice } from "./useDice"

const players: GamePlayer[] = [
  { id: asPlayerId("p1"), name: "Ada", color: "#41476E", life: 20, seat: 0 },
  { id: asPlayerId("p2"), name: "Grace", color: "#39755C", life: 20, seat: 1 },
  { id: asPlayerId("p3"), name: "Katherine", color: "#7B5A91", life: 20, seat: 2 },
]

function Table() {
  const dice = useDice(players, "game-1")
  if (!dice.open) dice.show()
  if (!dice.strip || !dice.grid) return null
  const { grid } = dice
  return (
    <>
      <DiceStrip {...dice.strip} />
      {players.map((player, index) => {
        const view = grid.seatFor(player)
        return view || grid.armed ? (
          <DiceSeatOverlay
            key={player.id}
            seatNumber={index + 1}
            playerName={player.name}
            color={player.color}
            foreground="#FFFFFF"
            contentRotation={0}
            dice={{ view, armed: grid.armed ?? undefined, onPress: () => grid.onPressSeat(player) }}
          />
        ) : null
      })}
    </>
  )
}

function renderTable() {
  return render(
    <ThemeProvider initialContext="dark">
      <Table />
    </ThemeProvider>,
  )
}

describe("useDice", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it("arms a tool, rolls for the tapped seat, and announces it with the seat's name", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()
    expect(view.queryByTestId("dice-seat-2")).toBeNull()

    fireEvent.press(view.getByTestId("dice-d20"))
    expect(view.getByTestId("dice-d20").props.accessibilityState.selected).toBe(true)
    expect(view.getAllByLabelText(/Roll a d20 for/)).toHaveLength(3)

    fireEvent.press(view.getByTestId("dice-seat-2"))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent("d2011")
    expect(view.queryByTestId("dice-seat-1")).toBeNull()
    expect(view.getByTestId("dice-d20").props.accessibilityState.selected).toBe(false)
    expect(announce).toHaveBeenLastCalledWith("Grace, d20, 11")

    fireEvent.press(view.getByTestId("dice-seat-2"))
    expect(view.queryByTestId("dice-seat-2")).toBeNull()
  })

  it("re-rolls only the tied seats", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    const rolls = [0.9, 0.9, 0.1, 0.2, 0.95]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-rolloff"))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent(/19Tie$/)
    expect(view.getByTestId("dice-seat-3")).toHaveTextContent(/3Out$/)
    expect(announce).toHaveBeenLastCalledWith("Tie at 19, Ada and Grace. Roll again")

    fireEvent.press(view.getByTestId("dice-rolloff"))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/20Goes first$/)
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("d205")
    expect(view.getByTestId("dice-seat-3")).toHaveTextContent("d203")
    expect(announce).toHaveBeenLastCalledWith("Grace rolled 20, goes first")
  })

  it("sweeps the seats before settling on the first player, or settles at once under reduced motion", () => {
    jest.useFakeTimers()
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    const motion = jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-first"))
    act(() => jest.advanceTimersByTime(1))
    expect(view.getByLabelText("Picking who goes first")).toBeTruthy()
    expect(view.queryByText("Goes first")).toBeNull()
    act(() => jest.runAllTimers())
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent("Goes first")
    expect(view.getByLabelText("Ada does not go first")).toBeTruthy()
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenLastCalledWith("Grace goes first")

    motion.mockReturnValue(true)
    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-first"))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent("Goes first")
  })

  it("reads each result through a live region on web, including a repeat", () => {
    jest.replaceProperty(Platform, "OS", "web")
    jest.useFakeTimers()
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()
    const region = () => view.getByTestId("dice-announcer", { includeHiddenElements: true })

    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    act(() => jest.runOnlyPendingTimers())
    expect(region()).toHaveTextContent("Ada, d20, 11")

    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(region()).toHaveTextContent("")
    act(() => jest.runOnlyPendingTimers())
    expect(region()).toHaveTextContent("Ada, d20, 11")
  })
})
