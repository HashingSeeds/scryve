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
      <Pressable testID="dice-rolloff" onPress={dice.rollOff} />
      <Pressable testID="dice-flip" onPress={dice.flip} />
      <Pressable testID="game-started" onPress={dice.gameStarted} />
      {players.map((player, index) => {
        const seat = {
          view: grid.seatFor(player),
          chips: grid.chipsFor(player),
          onPress: () => grid.onPressSeat(player),
          onChoose: (order: "first" | "second") => grid.onChoose(player, order),
          onPressChip: (chip: Parameters<typeof grid.onPressChip>[1]) =>
            grid.onPressChip(player, chip),
        }
        return (
          <View key={player.id}>
            {(["d6", "coin"] as const).map((tool) => (
              <Pressable
                key={tool}
                testID={`bag-${tool}-${index + 1}`}
                onPress={() => grid.bag.rollFor(player, tool)}
              />
            ))}
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
              onPress={seat.onPressChip}
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

  it("rolls at once for just the seat whose bag picked the die", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()
    fireEvent.press(view.getByTestId("bag-d6-2"))
    expect(view.getByTestId("dice-chip-2-d6")).toHaveTextContent("4")
    expect(view.queryByTestId("dice-chip-1-d6")).toBeNull()
  })

  it("shrinks a roll into a chip after a beat, which the next roll replaces", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable("pokemon")

    fireEvent.press(view.getByTestId("bag-coin-1"))
    expect(view.getByTestId("dice-coin-flipping")).toBeTruthy()
    expect(view.getByTestId("dice-seat-1")).not.toHaveTextContent("Tails")
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")
    expect(view.queryByTestId("dice-chip-1-coin")).toBeNull()

    act(() => jest.advanceTimersByTime(1600))
    expect(view.getByTestId("dice-chip-1-coin")).toHaveTextContent("Tails")
    expect(view.queryByTestId("dice-seat-1")).toBeNull()

    fireEvent.press(view.getByTestId("bag-coin-1"))
    expect(view.queryByTestId("dice-chip-1-coin")).toBeNull()
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")
  })

  it("tumbles again when a seat rolls the same result twice", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.7)
    const view = renderTable("pokemon")

    fireEvent.press(view.getByTestId("bag-coin-1"))
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")

    fireEvent.press(view.getByTestId("bag-coin-1"))
    expect(view.getByTestId("dice-coin-flipping")).toBeTruthy()
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("CoinTails")
  })

  it("settles a bloom at once under reduced motion, and a tap clears the chip", () => {
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(true)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("bag-d6-1"))
    expect(view.getByTestId("dice-chip-1-d6")).toHaveTextContent("4")

    fireEvent.press(view.getByTestId("dice-chip-1-d6"))
    expect(view.queryByTestId("dice-chip-1-d6")).toBeNull()
  })

  it("rolls off for every seat, re-rolls only the tied seats on its own, and a tap on any seat leaves a 1st chip", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockClear()
    const rolls = [0.9, 0.9, 0.1, 0.2, 0.95]
    jest.spyOn(Math, "random").mockImplementation(() => rolls.shift() ?? 0)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-rolloff"))
    expect(view.getByTestId("dice-seat-1")).not.toHaveTextContent("Tie")
    expect(announce).toHaveBeenLastCalledWith("Tie at 19, Ada and Grace. Rolling again")
    expect(announce).toHaveBeenCalledTimes(1)
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent(/19Tie$/)
    expect(view.getByTestId("dice-seat-3")).toHaveTextContent(/3Out$/)

    act(() => jest.advanceTimersByTime(900))
    act(() => jest.advanceTimersByTime(700))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/20Goes first$/)
    expect(view.getByTestId("dice-seat-1")).toHaveTextContent("d205")
    expect(announce).toHaveBeenLastCalledWith("Grace rolled 20, goes first")
    expect(view.getByTestId("dice-seat-1").props.accessibilityHint).toBe("Close dice")

    fireEvent.press(view.getByTestId("dice-seat-1"))
    act(() => jest.runAllTimers())
    expect(view.queryByTestId("dice-seat-1")).toBeNull()
    expect(view.queryByTestId("dice-seat-2")).toBeNull()
    expect(view.getByTestId("dice-chip-2-first")).toHaveTextContent("1st")
    expect(view.queryByTestId("dice-chip-1-first")).toBeNull()

    fireEvent.press(view.getByTestId("game-started"))
    expect(view.queryByTestId("dice-chip-2-first")).toBeNull()
  })

  it("flips the coin over every seat, then the winner chooses on its own card while the rest wait", () => {
    jest.useFakeTimers()
    jest.spyOn(reducedMotion, "useReducedMotion").mockReturnValue(false)
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()

    fireEvent.press(view.getByTestId("dice-flip"))
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe(
      "Flipping for who goes first",
    )
    expect(view.getAllByTestId("dice-coin-flipping")).toHaveLength(3)
    act(() => jest.advanceTimersByTime(1100))
    expect(view.getByTestId("dice-seat-2")).toHaveTextContent(/^Won the flipGoes first\?/)
    expect(view.getByTestId("dice-seat-1").props.accessibilityLabel).toBe("Waiting for the choice")
  })

  it("asks the flip's winner at once under reduced motion", () => {
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

    fireEvent.press(view.getByTestId("bag-d6-1"))
    view.changeGame("game-2")
    act(() => jest.runAllTimers())

    expect(view.queryByTestId("dice-seat-1")).toBeNull()
    expect(view.queryByTestId("dice-chip-1-d6")).toBeNull()
  })

  it("reads each result through a live region on web, including a repeat", () => {
    jest.replaceProperty(Platform, "OS", "web")
    jest.useFakeTimers()
    jest.spyOn(Math, "random").mockReturnValue(0.5)
    const view = renderTable()
    const region = () => view.getByTestId("dice-announcer", { includeHiddenElements: true })

    fireEvent.press(view.getByTestId("bag-d6-1"))
    act(() => jest.runOnlyPendingTimers())
    expect(region()).toHaveTextContent("Ada, d6, 4")

    fireEvent.press(view.getByTestId("bag-d6-1"))
    expect(region()).toHaveTextContent("")
    act(() => jest.runOnlyPendingTimers())
    expect(region()).toHaveTextContent("Ada, d6, 4")
  })
})
