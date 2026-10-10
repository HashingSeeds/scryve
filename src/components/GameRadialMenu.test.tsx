import { AccessibilityInfo, StyleSheet } from "react-native"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { Polygon, Polyline } from "react-native-svg"

import { ThemeProvider } from "@/theme/context"
import { darkTheme, lightTheme } from "@/theme/theme"
import { resetReducedMotionCacheForTests } from "@/utils/useReducedMotion"

import { GameRadialMenu, getRadialActionPoses, type RadialMenuAction } from "./GameRadialMenu"
import { mockHardwareBack } from "../../test/support/hardwareBack"

describe("GameRadialMenu", () => {
  const callbacks = Array.from({ length: 5 }, () => jest.fn())
  const actions: RadialMenuAction[] = [
    { kind: "layout", label: "Layout", onPress: callbacks[0] },
    { kind: "dice", label: "Dice", onPress: callbacks[1] },
    { kind: "status", label: "Status", onPress: callbacks[2] },
    { kind: "home", label: "Home", onPress: callbacks[3] },
    { kind: "end-game", label: "End game", onPress: callbacks[4] },
  ]

  function menu(
    open: boolean,
    onClose = jest.fn(),
    extra: Partial<Parameters<typeof GameRadialMenu>[0]> = {},
  ) {
    return (
      <ThemeProvider initialContext="light">
        <GameRadialMenu
          open={open}
          anchor={{ x: 0.5, y: 0.5 }}
          actions={actions}
          onToggle={jest.fn()}
          onClose={onClose}
          {...extra}
        />
      </ThemeProvider>
    )
  }

  it("keeps the actions collapsed until the center button opens them", () => {
    const view = render(menu(false))

    expect(view.getByTestId("game-menu-button").props.accessibilityState.expanded).toBe(false)
    expect(view.queryByTestId("layout-button")).toBeNull()

    view.rerender(menu(true))

    expect(view.getByTestId("game-menu-button").props.accessibilityState.expanded).toBe(true)
    for (const action of actions) expect(view.getByTestId(`${action.kind}-button`)).toBeTruthy()
  })

  it("draws the pentagon button with the menu tokens", () => {
    const view = render(menu(false))

    expect(view.getByTestId("game-menu-pentagon")).toBeTruthy()
    const pentagon = view
      .UNSAFE_getAllByType(Polygon)
      .find((polygon) => polygon.props.strokeWidth === 7)
    expect(pentagon).toBeTruthy()
    expect(lightTheme.colors.gameMenu.anchorBorder).toBe("#FFFFFF")
    expect(pentagon!.props.stroke).toBe(lightTheme.colors.gameMenu.anchorBorder)
    expect(pentagon!.props.points.split(" ")).toHaveLength(5)
  })

  it("uses the flat Keystone II treatment by default in dark mode", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <GameRadialMenu
          open={false}
          anchor={{ x: 0.5, y: 0.5 }}
          actions={actions}
          onToggle={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    )

    const pentagon = view
      .UNSAFE_getAllByType(Polygon)
      .find((polygon) => polygon.props.strokeWidth === 7)
    expect(pentagon).toBeTruthy()
    expect(pentagon!.props.fill).toBe("url(#keystoneTwoFill)")
    expect(darkTheme.colors.gameMenu.anchorBorder).toBe("#000000")
    expect(pentagon!.props.stroke).toBe(darkTheme.colors.gameMenu.anchorBorder)
    expect(
      view.UNSAFE_getAllByType(Polygon).find((polygon) => polygon.props.strokeWidth === 1.4)!.props
        .stroke,
    ).toBe(darkTheme.colors.gameMenu.anchorBorder)
    expect(view.UNSAFE_queryAllByType(Polyline)).toHaveLength(0)
  })

  it("keeps the menu glyph in centered square bounds", () => {
    const view = render(menu(false))
    const glyph = view.getByTestId("game-menu-glyph")
    const glyphStyle = StyleSheet.flatten(glyph.props.style)

    expect(glyphStyle).toMatchObject({
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    })
  })

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("resolves action kinds through the %s theme", (initialContext, theme) => {
    const view = render(
      <ThemeProvider initialContext={initialContext}>
        <GameRadialMenu
          open
          anchor={{ x: 0.5, y: 0.5 }}
          actions={actions}
          onToggle={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    )

    actions.forEach((action) => {
      const button = view.getByTestId(`${action.kind}-button`)
      const style = StyleSheet.flatten(button.props.style)
      expect(style.backgroundColor).toBe(theme.colors.gameMenu.actions[action.kind])
    })
  })

  it("collapses into an exit button while an exit action is set", () => {
    const onExit = jest.fn()
    const onToggle = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <GameRadialMenu
          open={false}
          anchor={{ x: 0.5, y: 0.5 }}
          actions={actions}
          exitAction={{ label: "Exit commander damage", onPress: onExit }}
          onToggle={onToggle}
          onClose={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe(
      "Exit commander damage",
    )
    expect(view.getByTestId("game-menu-button").props.accessibilityState.expanded).toBe(false)
    expect(view.queryByTestId("layout-button")).toBeNull()
    expect(view.queryByTestId("game-menu-backdrop")).toBeNull()

    fireEvent.press(view.getByTestId("game-menu-button"))

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  // why: queried by component type because the host element only carries processed SVG props.
  const signalLayer = (view: ReturnType<typeof render>, testID: string) =>
    view.UNSAFE_queryAllByType(Polygon).find((polygon) => polygon.props.testID === testID)

  it("rings and badges the pentagon while a sync signal is set, fading the ring out in its last color", () => {
    const signal = {
      tone: "offline",
      badge: "3",
      accessibilityText: "Offline, 3 changes saved on this device",
    } as const
    const view = render(menu(false, jest.fn(), { signal }))

    expect(signalLayer(view, "game-menu-signal-ring")!.props.stroke).toBe(
      lightTheme.colors.gameMenu.signal.offline,
    )
    expect(signalLayer(view, "game-menu-signal-trace")).toBeUndefined()
    expect(view.getByTestId("game-menu-signal-badge")).toHaveTextContent("3")
    expect(view.getByTestId("game-menu-button").props.accessibilityLabel).toBe(
      "Game options. Offline, 3 changes saved on this device",
    )

    view.rerender(menu(false))
    expect(signalLayer(view, "game-menu-signal-ring")!.props.stroke).toBe(
      lightTheme.colors.gameMenu.signal.offline,
    )
    expect(view.queryByTestId("game-menu-signal-badge")).toBeNull()
  })

  it("circles a trace for a moving sync state, held still as dashes until motion is allowed", async () => {
    const signal = { tone: "catchingUp", badge: "2" } as const
    const view = render(menu(false, jest.fn(), { signal }))

    const still = signalLayer(view, "game-menu-signal-trace")!
    const [stillDash, stillGap] = still.props.strokeDasharray
    expect(still.props.stroke).toBe(lightTheme.colors.gameMenu.signal.catchingUp)
    expect(stillDash).toBe(stillGap)
    expect(still.props.animatedProps).toBeUndefined()
    expect(signalLayer(view, "game-menu-signal-ring")).toBeUndefined()

    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    const moving = render(menu(false, jest.fn(), { signal }))
    await waitFor(() =>
      expect(signalLayer(moving, "game-menu-signal-trace")!.props.animatedProps).toBeDefined(),
    )
    const [sideLength, restOfOutline] = signalLayer(moving, "game-menu-signal-trace")!.props
      .strokeDasharray
    expect(restOfOutline).toBeCloseTo(sideLength * 4)
    jest.restoreAllMocks()
    resetReducedMotionCacheForTests()
  })

  it("offers the sync status line only while open and keeps a blocked action pressable", () => {
    const onStatus = jest.fn()
    const onEnd = jest.fn()
    const blockedActions: RadialMenuAction[] = actions.map((action) =>
      action.kind === "end-game"
        ? { ...action, detail: "needs connection", blocked: true, onPress: onEnd }
        : action,
    )
    const statusLine = {
      text: "Offline · 3 changes saved",
      tone: "offline",
      onPress: onStatus,
    } as const
    const view = render(menu(false, jest.fn(), { statusLine, actions: blockedActions }))
    expect(view.queryByTestId("game-menu-status-line")).toBeNull()

    view.rerender(menu(true, jest.fn(), { statusLine, actions: blockedActions }))
    fireEvent.press(view.getByTestId("game-menu-status-line"))
    expect(onStatus).toHaveBeenCalledTimes(1)

    const end = view.getByTestId("end-game-button")
    expect(end.props.accessibilityLabel).toBe("End game, needs connection")
    fireEvent.press(end)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it("runs radial actions and closes from the dimmed board", () => {
    const onClose = jest.fn()
    const view = render(menu(true, onClose))

    fireEvent.press(view.getByTestId("dice-button"))
    fireEvent.press(view.getByTestId("game-menu-backdrop"))

    expect(callbacks[1]).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("lets Android Back close the menu or exit commander damage, and passes it through otherwise", () => {
    const pressBack = mockHardwareBack()
    const onClose = jest.fn()
    const onExit = jest.fn()
    const view = render(menu(false, onClose))

    expect(pressBack()).toBe(false)

    view.rerender(menu(true, onClose))
    act(() => void pressBack())
    expect(onClose).toHaveBeenCalledTimes(1)

    view.rerender(
      menu(false, onClose, { exitAction: { label: "Exit commander damage", onPress: onExit } }),
    )
    act(() => void pressBack())
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    view.rerender(menu(false, onClose))
    expect(pressBack()).toBe(false)
    jest.restoreAllMocks()
  })

  it("poses every action toward open space when the anchor nears a screen edge", () => {
    expect(getRadialActionPoses({ x: 0.2, y: 0.5 }).every((pose) => pose.x >= 0)).toBe(true)
    expect(getRadialActionPoses({ x: 0.8, y: 0.5 }).every((pose) => pose.x <= 0)).toBe(true)
    expect(getRadialActionPoses({ x: 2 / 3, y: 0.5 })).toEqual(
      getRadialActionPoses({ x: 0.5, y: 0.5 }),
    )
    expect(getRadialActionPoses({ x: 0.5, y: 0.5 }, 4)).toHaveLength(4)
    expect(getRadialActionPoses({ x: 0.5, y: 0.5 })).toHaveLength(5)
  })
})
