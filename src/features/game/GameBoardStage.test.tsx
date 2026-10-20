import { StyleSheet, View, type ViewProps } from "react-native"
import { act, fireEvent, render, screen, within } from "@testing-library/react-native"

import type { GameMenuActions, RadialMenuAction } from "@/components/GameRadialMenu"
import type { PlayerGridProps } from "@/components/PlayerGrid"
import { ThemeProvider } from "@/theme/context"

import { GameBoardStage } from "./GameBoardStage"
import type { ScreenPinnedMetrics } from "../../../modules/screen-pinned-view"

const mockNative: { report?: (metrics: ScreenPinnedMetrics) => void } = {}

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
