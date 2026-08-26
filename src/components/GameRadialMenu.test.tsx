import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"
import { Polygon } from "react-native-svg"

import { ThemeProvider } from "@/theme/context"
import { darkTheme, lightTheme } from "@/theme/theme"

import { GameRadialMenu, getRadialActionPoses, type RadialMenuAction } from "./GameRadialMenu"

describe("GameRadialMenu", () => {
  const callbacks = Array.from({ length: 5 }, () => jest.fn())
  const actions: RadialMenuAction[] = [
    { kind: "layout", label: "Layout", onPress: callbacks[0] },
    { kind: "undo", label: "Undo", onPress: callbacks[1] },
    { kind: "status", label: "Status", onPress: callbacks[2] },
    { kind: "home", label: "Home", onPress: callbacks[3] },
    { kind: "end-game", label: "End game", onPress: callbacks[4] },
  ]

  function menu(open: boolean, onClose = jest.fn()) {
    return (
      <ThemeProvider initialContext="light">
        <GameRadialMenu
          open={open}
          anchor={{ x: 0.5, y: 0.5 }}
          actions={actions}
          onToggle={jest.fn()}
          onClose={onClose}
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

  it("draws the pentagon button with the light menu tokens", () => {
    const view = render(menu(false))

    expect(view.getByTestId("game-menu-pentagon")).toBeTruthy()
    const pentagon = view.UNSAFE_getByType(Polygon)
    expect(pentagon.props.fill).toBe(lightTheme.colors.gameMenu.anchor)
    expect(pentagon.props.stroke).toBe(lightTheme.colors.gameMenu.anchorBorder)
    expect(pentagon.props.points.split(" ")).toHaveLength(5)
  })

  it("uses distinct charcoal fill and border colors in dark mode", () => {
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

    const pentagon = view.UNSAFE_getByType(Polygon)
    expect(pentagon.props.fill).toBe(darkTheme.colors.gameMenu.anchor)
    expect(pentagon.props.stroke).toBe(darkTheme.colors.gameMenu.anchorBorder)
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

  it("runs radial actions and closes from the dimmed board", () => {
    const onClose = jest.fn()
    const view = render(menu(true, onClose))

    fireEvent.press(view.getByTestId("undo-button"))
    fireEvent.press(view.getByTestId("game-menu-backdrop"))

    expect(callbacks[1]).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
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
