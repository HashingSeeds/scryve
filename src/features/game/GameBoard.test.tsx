import { View } from "react-native"
import { fireEvent, render, screen, within } from "@testing-library/react-native"

import { prefetchRules } from "@/features/rules/rulesSource"
import { ThemeProvider } from "@/theme/context"

import { asPlayerId } from "./domain"
import { type BoardChromeOptions, GameBoard, useBoardChrome } from "./GameBoard"

jest.mock("@/features/rules/rulesSource", () => ({ prefetchRules: jest.fn() }))

const NAMES = ["Ada", "Grace", "Katherine", "Dorothy"]

function Board(options: Partial<BoardChromeOptions> & { playerCount?: number }) {
  const { playerCount = 2, ...rest } = options
  const chrome = useBoardChrome({
    gameId: "game-1",
    system: undefined,
    players: NAMES.slice(0, playerCount).map((name, seat) => ({
      id: asPlayerId(`player-${seat + 1}`),
      name,
    })),
    layout: { value: "auto", onChange: jest.fn() },
    petals: [
      { kind: "players", label: "Players", onPress: jest.fn() },
      { kind: "end-game", label: "End", onPress: jest.fn() },
    ],
    attack: { dispatch: jest.fn(), inspectedPlayerId: null },
    ...rest,
  })
  return <GameBoard chrome={chrome} renderGrid={() => <View testID="grid" />} />
}

function renderBoard(options: Parameters<typeof Board>[0] = {}) {
  return render(
    <ThemeProvider initialContext="dark">
      <Board {...options} />
    </ThemeProvider>,
  )
}

const openMenu = () => fireEvent.press(screen.getByTestId("game-menu-button"))

describe("GameBoard chrome", () => {
  const appDestinations = {
    onHistory: jest.fn(),
    onSettings: jest.fn(),
    onSupport: jest.fn(),
    onAccount: jest.fn(),
  }
  const openMore = () => {
    openMenu()
    fireEvent.press(screen.getByTestId("utility-menu-button"))
  }

  it("puts History in the fan and the system's rules beside Decks under the more button", () => {
    const onRules = jest.fn()
    const onDecks = jest.fn()
    const onHistory = jest.fn()
    renderBoard({ system: "mtg", onRules, onDecks, ...appDestinations, onHistory })

    expect(prefetchRules).toHaveBeenCalledTimes(1)
    openMenu()
    expect(screen.queryByTestId("rules-button")).toBeNull()
    fireEvent.press(screen.getByTestId("history-button"))
    expect(onHistory).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("game-menu-backdrop")).toBeNull()

    openMore()
    expect(screen.queryByTestId("utility-history-button")).toBeNull()
    fireEvent.press(screen.getByTestId("utility-rules-button"))
    expect(onRules).toHaveBeenCalledWith("mtg")
    expect(screen.queryByTestId("game-menu-backdrop")).toBeNull()

    openMore()
    fireEvent.press(screen.getByTestId("utility-decks-button"))
    expect(onDecks).toHaveBeenCalledTimes(1)
  })

  it("leaves Rules out of the more button when the game has no rules", () => {
    renderBoard({ onDecks: jest.fn(), ...appDestinations })
    openMore()
    expect(screen.queryByTestId("utility-rules-button")).toBeNull()
    expect(screen.getByTestId("utility-decks-button")).toBeTruthy()
  })

  it("finishes an attack before History or an app destination leaves the board", () => {
    const dispatch = jest.fn()
    const sent = () => expect(dispatch).toHaveBeenCalledWith({ type: "send" })
    const onHistory = jest.fn(sent)
    const onSettings = jest.fn(sent)
    renderBoard({
      attack: { dispatch, inspectedPlayerId: null },
      ...appDestinations,
      onHistory,
      onSettings,
    })
    openMenu()
    fireEvent.press(screen.getByTestId("history-button"))
    expect(onHistory).toHaveBeenCalledTimes(1)

    dispatch.mockClear()
    openMore()
    fireEvent.press(screen.getByTestId("utility-settings-button"))
    expect(onSettings).toHaveBeenCalledTimes(1)
  })

  it("pauses an attack under the menu, finishes it when a petal takes over the board, and exits an inspected commander", () => {
    const dispatch = jest.fn()
    const view = renderBoard({
      system: "mtg",
      onRules: jest.fn(),
      ...appDestinations,
      attack: { dispatch, inspectedPlayerId: null },
    })
    openMenu()
    openMenu()
    openMore()
    fireEvent.press(screen.getByTestId("utility-rules-button"))
    expect(dispatch).not.toHaveBeenCalled()
    openMenu()
    fireEvent.press(screen.getByTestId("players-button"))
    expect(dispatch).toHaveBeenCalledWith({ type: "send" })

    view.rerender(
      <ThemeProvider initialContext="dark">
        <Board attack={{ dispatch, inspectedPlayerId: asPlayerId("player-2") }} />
      </ThemeProvider>,
    )
    dispatch.mockClear()
    expect(screen.getByTestId("game-menu-button").props.accessibilityLabel).toBe(
      "Exit commander damage",
    )
    fireEvent.press(screen.getByTestId("game-menu-button"))
    expect(dispatch).toHaveBeenCalledWith({ type: "send" })
  })

  it("runs a game's own petal after closing the menu", () => {
    const onPlayers = jest.fn()
    renderBoard({
      petals: [
        { kind: "players", label: "Players", onPress: onPlayers },
        { kind: "end-game", label: "End", disabled: true, onPress: jest.fn() },
      ],
    })
    openMenu()
    expect(screen.getByTestId("end-game-button").props.accessibilityState.disabled).toBe(true)
    fireEvent.press(screen.getByTestId("players-button"))
    expect(onPlayers).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("game-menu-backdrop")).toBeNull()
  })

  it("offers layouts only when there is a choice, and closes once one is picked", () => {
    const twoPlayers = renderBoard()
    openMenu()
    expect(screen.getByTestId("layout-button").props.accessibilityState.disabled).toBe(true)
    twoPlayers.unmount()

    const onChange = jest.fn()
    renderBoard({ playerCount: 4, layout: { value: "auto", onChange } })
    openMenu()
    fireEvent.press(screen.getByTestId("layout-button"))
    expect(within(screen.getByTestId("layout-picker-dialog")).getByText("Cancel")).toBeTruthy()
    fireEvent.press(screen.getByTestId("layout-tabletop"))
    expect(onChange).toHaveBeenCalledWith("tabletop")
    expect(screen.queryByTestId("layout-picker-dialog")).toBeNull()
  })

  it("keeps a seat map under the layouts with Done, even when there is one layout", () => {
    renderBoard({ layout: { value: "auto", onChange: jest.fn(), seats: <View testID="seats" /> } })
    openMenu()
    fireEvent.press(screen.getByTestId("layout-button"))
    expect(within(screen.getByTestId("layout-picker-scroll")).getByTestId("seats")).toBeTruthy()
    expect(screen.queryByTestId("layout-auto")).toBeNull()
    fireEvent.press(within(screen.getByTestId("layout-picker-dialog")).getByText("Done"))
    expect(screen.queryByTestId("layout-picker-dialog")).toBeNull()
  })
})
