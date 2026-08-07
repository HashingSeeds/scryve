import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { GameRadialMenu, getRadialActionOffsets, type RadialMenuAction } from "./GameRadialMenu"

describe("GameRadialMenu", () => {
  const callbacks = Array.from({ length: 5 }, () => jest.fn())
  const actions: RadialMenuAction[] = ["Layout", "Undo", "Home", "Finish", "Abandon"].map(
    (label, index) => ({
      id: label.toLowerCase(),
      label,
      glyph: String(index + 1),
      color: "#FBC878",
      onPress: callbacks[index],
    }),
  )

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
    for (const action of actions) expect(view.getByTestId(`${action.id}-button`)).toBeTruthy()
  })

  it("runs radial actions and closes from the dimmed board", () => {
    const onClose = jest.fn()
    const view = render(menu(true, onClose))

    fireEvent.press(view.getByTestId("undo-button"))
    fireEvent.press(view.getByTestId("game-menu-backdrop"))

    expect(callbacks[1]).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("fans inward when a layout moves the anchor toward a screen edge", () => {
    expect(getRadialActionOffsets({ x: 0.33, y: 0.5 })[2].x).toBeGreaterThan(0)
    expect(getRadialActionOffsets({ x: 0.67, y: 0.5 })[2].x).toBeLessThan(0)
    expect(getRadialActionOffsets({ x: 0.5, y: 0.5 }, 4)).toHaveLength(4)
  })
})
