import { StyleSheet, View, type ViewProps } from "react-native"
import { act, fireEvent, render, screen, within } from "@testing-library/react-native"

import type { GameMenuActions, RadialMenuAction } from "@/components/GameRadialMenu"
import type { PlayerGridLayoutVariant, PlayerGridProps } from "@/components/PlayerGrid"
import { ThemeProvider } from "@/theme/context"

import { GameBoardStage } from "./GameBoardStage"
import type { ScreenPinnedMetrics } from "../../../modules/screen-pinned-view"

const mockNative: { report?: (metrics: ScreenPinnedMetrics) => void } = {}
const mockHinge = { spans: false }

jest.mock("@/utils/useWindowSpansHinge", () => ({
  useWindowSpansHinge: () => mockHinge.spans,
}))

jest.mock("../../../modules/screen-pinned-view", () => {
  const { View: MockView } = jest.requireActual<typeof import("react-native")>("react-native")
  return {
    SCREEN_PINNING_AVAILABLE: true,
    ScreenPinnedView: ({
      onOrientationChange,
      ...props
    }: ViewProps & { onOrientationChange: (metrics: ScreenPinnedMetrics) => void }) => {
      mockNative.report = onOrientationChange
      return <MockView testID="screen-pinned-view" {...props} />
    },
  }
})

function menuActions(
  dice: RadialMenuAction = { kind: "dice", label: "Dice", onPress: jest.fn() },
): GameMenuActions {
  return [
    { kind: "layout", label: "Layout", onPress: jest.fn() },
    dice,
    { kind: "players", label: "Players", onPress: jest.fn() },
    { kind: "rules", label: "Rules", onPress: jest.fn() },
    { kind: "end-game", label: "End", onPress: jest.fn() },
  ]
}

describe("GameBoardStage on a pinned screen", () => {
  it("lays the board out at the reported hardware size and turns the menu to face the holder", () => {
    const renderGrid = jest.fn((_orientation: PlayerGridProps["boardOrientation"]) => (
      <View testID="grid" />
    ))
    render(
      <ThemeProvider initialContext="dark">
        <GameBoardStage
          playerCount={4}
          layoutVariant="auto"
          renderGrid={renderGrid}
          menu={{ open: false, actions: menuActions(), onToggle: jest.fn(), onClose: jest.fn() }}
        />
      </ThemeProvider>,
    )

    const insets = { top: 47, right: 0, bottom: 34, left: 0 }
    act(() =>
      mockNative.report?.({ pinned: true, holderAngle: 90, width: 390, height: 844, insets }),
    )

    expect(renderGrid).toHaveBeenLastCalledWith(
      expect.objectContaining({
        width: 390,
        height: 844,
        rotation: 0,
        insets,
        touchRotation: -90,
      }),
    )
    expect(StyleSheet.flatten(screen.getByTestId("game-menu-cluster").props.style)).toEqual(
      expect.objectContaining({ transform: [{ rotate: "90deg" }] }),
    )
  })

  it("carries the armed tool on the pinned board's pentagon", () => {
    const onExit = jest.fn()
    render(
      <ThemeProvider initialContext="dark">
        <GameBoardStage
          playerCount={2}
          layoutVariant="auto"
          renderGrid={() => <View testID="grid" />}
          menu={{
            open: false,
            actions: menuActions(),
            exitAction: { label: "Close dice", onPress: onExit, heldTool: "coin" },
            onToggle: jest.fn(),
            onClose: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    const cluster = screen.getByTestId("game-menu-cluster")
    expect(within(cluster).getByTestId("game-menu-held-tool")).toBeTruthy()
    fireEvent.press(within(cluster).getByTestId("game-menu-button"))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it("turns the connected sync status with the menu so the holder can read it", () => {
    const onPress = jest.fn()
    render(
      <ThemeProvider initialContext="dark">
        <GameBoardStage
          playerCount={2}
          layoutVariant="auto"
          renderGrid={() => <View testID="grid" />}
          menu={{
            open: true,
            actions: menuActions(),
            statusLine: { text: "Offline for 2m", tone: "offline", onPress },
            onToggle: jest.fn(),
            onClose: jest.fn(),
          }}
        />
      </ThemeProvider>,
    )

    const cluster = screen.getByTestId("game-menu-cluster")
    const statusLine = within(cluster).getByTestId("game-menu-status-line")
    expect(statusLine.props.accessibilityLabel).toBe("Offline for 2m")
    fireEvent.press(statusLine)
    expect(onPress).toHaveBeenCalled()
  })
})

describe("GameBoardStage on an open iPhone Duo", () => {
  afterEach(() => {
    mockHinge.spans = false
  })

  function renderOpenDuo({
    playerCount = 6,
    layoutVariant = "tabletop",
  }: { playerCount?: number; layoutVariant?: PlayerGridLayoutVariant } = {}) {
    const renderGrid = jest.fn((_orientation: PlayerGridProps["boardOrientation"]) => (
      <View testID="grid" />
    ))
    const stage = () => (
      <ThemeProvider initialContext="dark">
        <GameBoardStage
          playerCount={playerCount}
          layoutVariant={layoutVariant}
          renderGrid={renderGrid}
          menu={{ open: false, actions: menuActions(), onToggle: jest.fn(), onClose: jest.fn() }}
        />
      </ThemeProvider>
    )
    const view = render(stage())
    act(() =>
      mockNative.report?.({
        pinned: true,
        holderAngle: -90,
        width: 669,
        height: 951,
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    )
    return { renderGrid, rerender: () => view.rerender(stage()) }
  }

  const lastTableTurn = (renderGrid: ReturnType<typeof renderOpenDuo>["renderGrid"]) =>
    renderGrid.mock.calls.at(-1)?.[0]?.tableTurn

  it("offers six Table seats the Table layout and lands the board when players take it", () => {
    mockHinge.spans = true
    const { renderGrid } = renderOpenDuo()

    expect(lastTableTurn(renderGrid)).toMatchObject({ landed: undefined })
    fireEvent.press(screen.getByLabelText("Turn the board to fit the open screen"))

    expect(screen.queryByTestId("table-turn-ring")).toBeNull()
    expect(lastTableTurn(renderGrid)).toMatchObject({ landed: 1 })
  })

  it("offers the turn to any open board with seats facing its short edges", () => {
    mockHinge.spans = true
    const { renderGrid } = renderOpenDuo({ playerCount: 4, layoutVariant: "auto" })

    expect(lastTableTurn(renderGrid)).toMatchObject({ landed: undefined })
    expect(screen.getByTestId("table-turn-ring")).toBeTruthy()
  })

  it("unfolds a two-player board without offering the turn, since both seats already face the long edges", () => {
    mockHinge.spans = true
    const { renderGrid } = renderOpenDuo({ playerCount: 2, layoutVariant: "auto" })

    expect(lastTableTurn(renderGrid)).toMatchObject({ landed: undefined })
    expect(screen.queryByTestId("table-turn-ring")).toBeNull()
  })

  it("keeps the kept board when players decline, and offers again after the Duo reopens", () => {
    mockHinge.spans = true
    const { renderGrid, rerender } = renderOpenDuo()

    fireEvent.press(screen.getByLabelText("Keep this layout"))
    expect(screen.queryByTestId("table-turn-ring")).toBeNull()
    expect(lastTableTurn(renderGrid)).toMatchObject({ landed: undefined })

    mockHinge.spans = false
    rerender()
    mockHinge.spans = true
    rerender()
    expect(screen.getByTestId("table-turn-ring")).toBeTruthy()
  })

  it("drops a turn in progress when the Duo closes, so the next opening starts square", () => {
    mockHinge.spans = true
    const { renderGrid, rerender } = renderOpenDuo()
    act(() => lastTableTurn(renderGrid)?.angle.set(40))

    mockHinge.spans = false
    rerender()
    mockHinge.spans = true
    rerender()

    expect(lastTableTurn(renderGrid)?.angle.value).toBe(0)
  })

  it("makes no offer while the Duo is closed", () => {
    renderOpenDuo()

    expect(screen.queryByTestId("table-turn-ring")).toBeNull()
  })
})
