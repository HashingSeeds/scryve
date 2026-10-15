import { AccessibilityInfo, Platform, Pressable, View } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { DiceChips } from "@/components/DiceChips"
import { diceCoversSeat, DiceSeatOverlay } from "@/components/DiceSeatOverlay"
import { ResultLiveRegion } from "@/components/ResultAnnouncer"
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

function Table({ gameId = "game-1", system = "mtg" }: { gameId?: string; system?: string }) {
  const dice = useDice(players, gameId, system)
  const { grid } = dice
  return (
    <>
      <ResultLiveRegion testID="dice-announcer" message={dice.webMessage} />
      {dice.tools.map((tool) => (
        <Pressable
          key={tool.key}
          testID={`dice-${tool.key}`}
          accessibilityLabel={tool.accessibilityLabel}
          accessibilityState={tool.selected === undefined ? undefined : { selected: tool.selected }}
          onPress={tool.onPress}
        />
      ))}
      <Pressable testID="dice-rolloff" onPress={dice.rollOff} />
      <Pressable testID="dice-flip" onPress={dice.flip} />
      <Pressable testID="dice-close" accessibilityLabel="Close dice" onPress={dice.close} />
      <Pressable testID="game-started" onPress={dice.gameStarted} />
      {players.map((player, index) => {
        const seat = {
          view: grid.seatFor(player),
          armed: grid.armed ?? undefined,
          chips: grid.chipsFor(player),
          onPress: () => grid.onPressSeat(player),
          onChoose: (order: "first" | "second") => grid.onChoose(player, order),
          onClearChip: (chip: Parameters<typeof grid.onClearChip>[1]) =>
            grid.onClearChip(player, chip),
        }
        return (
          <View key={player.id}>
            {diceCoversSeat(seat) ? (
              <DiceSeatOverlay
                seatNumber={index + 1}
                playerName={player.name}
                color={player.color}
                foreground="#FFFFFF"
                contentRotation={0}
                dice={seat}
              />
            ) : null}
            <DiceChips
              seatNumber={index + 1}
              playerName={player.name}
              foreground="#FFFFFF"
              chips={seat.chips}
              onClear={seat.onClearChip}
            />
          </View>
        )
      })}
    </>
  )
}

function renderTable(system?: string) {
  const view = render(
    <ThemeProvider initialContext="dark">
      <Table system={system} />
    </ThemeProvider>,
  )
  return Object.assign(view, {
    changeGame: (gameId: string) =>
      view.rerender(
        <ThemeProvider initialContext="dark">
          <Table gameId={gameId} />
        </ThemeProvider>,
      ),
  })
}

describe("useDice", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it("arms a tool, rolls for the tapped seat, keeps the tool armed, and announces the seat's name", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()
    expect(view.queryByTestId("dice-seat-2")).toBeNull()

    fireEvent.press(view.getByTestId("dice-d20"))
    expect(view.getByTestId("dice-d20").props.accessibilityState.selected).toBe(true)
    expect(view.getAllByLabelText(/Roll a d20 for/)).toHaveLength(3)

    fireEvent.press(view.getByTestId("dice-seat-2"))
    expect(view.getByTestId("dice-chip-2-d20")).toHaveTextContent("11")
    expect(view.getByTestId("dice-seat-2").props.accessibilityLabel).toBe("Roll a d20 for Grace")
    expect(view.getByTestId("dice-d20").props.accessibilityState.selected).toBe(true)
    expect(announce).toHaveBeenLastCalledWith("Grace, d20, 11")

    fireEvent.press(view.getByTestId("dice-d20"))
    expect(view.getByTestId("dice-d20").props.accessibilityState.selected).toBe(false)
  })

  it("offers Yu-Gi-Oh! a d6 instead of a d20", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable("ygo")
    expect(view.queryByTestId("dice-d20")).toBeNull()

    fireEvent.press(view.getByTestId("dice-d6"))
    fireEvent.press(view.getByTestId("dice-seat-2"))
    expect(view.getByTestId("dice-chip-2-d6")).toHaveTextContent("4")
    expect(view.getByTestId("dice-seat-2").props.accessibilityLabel).toBe("Roll a d6 for Grace")
  })

  it("shrinks a roll into a chip after a beat, which the next roll replaces and close clears", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-coin"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(view.getByTestId("dice-coin-flipping")).toBeTruthy()
    expect(view.getByTestId("dice-seat-1")).not.toHaveTextContent("Tails")
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")
    expect(view.queryByTestId("dice-chip-1-coin")).toBeNull()

    act(() => jest.advanceTimersByTime(3800))
    expect(view.getByTestId("dice-chip-1-coin")).toHaveTextContent("Tails")
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe("Flip a coin for Ada")

    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(view.queryByTestId("dice-chip-1-coin")).toBeNull()
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")

    fireEvent.press(view.getByTestId("dice-close"))
    expect(view.queryByTestId("dice-seat-1")).toBeNull()
    act(() => jest.runAllTimers())
    expect(view.queryByTestId("dice-chip-1-coin")).toBeNull()
  })

  it("tumbles again when a seat rolls the same result twice", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.7)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-coin"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")

    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(view.getByTestId("dice-coin-flipping")).toBeTruthy()
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")
  })

  it("settles a bloom at once under reduced motion, and a tap clears the chip", () => {
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(true)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(view.getByTestId("dice-chip-1-d20")).toHaveTextContent("11")

    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-chip-1-d20"))
    expect(view.queryByTestId("dice-chip-1-d20")).toBeNull()
  })

  it("rolls off for every seat, re-rolls only the tied seats from their cards, and leaves a 1st chip", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    const rolls = [0.9, 0.9, 0.1, 0.2, 0.95]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-rolloff"))
    expect(view.getByTestId("dice-seat-1")).not.toHaveTextContent("Tie")
    expect(announce).toHaveBeenLastCalledWith("Tie at 19, Ada and Grace. Roll again")
    expect(announce).toHaveBeenCalledTimes(1)
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent(/19Tie/)
    expect(view.getByTestId("dice-seat-3")).toHaveTextContent(/3Out$/)
    act(() => jest.advanceTimersByTime(5000))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent(/19Tie/)

    fireEvent.press(view.getByTestId("dice-seat-2"))
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/20Goes first$/)
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("d205")
    expect(announce).toHaveBeenLastCalledWith("Grace rolled 20, goes first")

    act(() => jest.advanceTimersByTime(1800))
    expect(view.queryByTestId("dice-seat-2")).toBeNull()
    expect(view.getByTestId("dice-chip-2-first")).toHaveTextContent("1st")
    expect(view.queryByTestId("dice-chip-1-first")).toBeNull()

    fireEvent.press(view.getByTestId("game-started"))
    expect(view.queryByTestId("dice-chip-2-first")).toBeNull()
  })

  it("flips to one seat, which chooses on its own card while the rest wait", () => {
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(true)
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-flip"))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/^Won the flipGoes first\?/)
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe("Waiting for the choice")
    expect(announce).toHaveBeenLastCalledWith("Grace won the flip. Go first or second")

    fireEvent.press(view.getByTestId("dice-go-second"))
    expect(view.getByTestId("dice-chip-3-first")).toBeTruthy()
    expect(view.queryByTestId("dice-chip-2-first")).toBeNull()
    expect(announce).toHaveBeenLastCalledWith("Katherine goes first")
  })

  it("shows the Yu-Gi-Oh! roll, then asks its winner to go first or second", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    const rolls = [0.1, 0.9, 0.2]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const view = renderTable("ygo")

    fireEvent.press(view.getByTestId("dice-rolloff"))
    expect(announce).toHaveBeenLastCalledWith("Grace rolled 6. Go first or second")
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/d66Won the roll$/)

    act(() => jest.advanceTimersByTime(1800))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/^Won the rollGoes first\?/)
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe("Waiting for the choice")

    fireEvent.press(view.getByTestId("dice-go-first"))
    expect(announce).toHaveBeenLastCalledWith("Grace goes first")
  })

  it("drops a pending settle when the game changes, so the next game's dice stay untouched", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    view.changeGame("game-2")
    act(() => jest.runAllTimers())

    expect(view.queryByTestId("dice-seat-1")).toBeNull()
    expect(view.queryByTestId("dice-chip-1-d20")).toBeNull()
  })

  it("does not read a cleared result after dice close on web", () => {
    jest.replaceProperty(Platform, "OS", "web")
    jest.useFakeTimers()
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-d20"))
    fireEvent.press(view.getByTestId("dice-seat-1"))
    fireEvent.press(view.getByTestId("dice-close"))
    act(() => jest.runOnlyPendingTimers())

    expect(view.getByTestId("dice-announcer", { includeHiddenElements: true })).toHaveTextContent(
      "",
    )
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

    fireEvent.press(view.getByTestId("dice-seat-1"))
    expect(region()).toHaveTextContent("")
    act(() => jest.runOnlyPendingTimers())
    expect(region()).toHaveTextContent("Ada, d20, 11")
  })
})
