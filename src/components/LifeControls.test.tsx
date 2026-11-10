import { Dimensions, StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { PLAYER_COLORS } from "@/features/game/domain"
import { ThemeProvider } from "@/theme/context"
import { accessibleForeground, contrastRatio } from "@/utils/colorContrast"

import { glyphSlide, LifeControls, totalTargetBox } from "./LifeControls"

describe("LifeControls", () => {
  it("maps taps to one life and delegates long presses to custom amount editing", () => {
    const onChange = jest.fn()
    const onOpenEditor = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" onChange={onChange} onOpenEditor={onOpenEditor} />
      </ThemeProvider>,
    )
    for (const delta of [-1, 1] as const) {
      const button = view.getByTestId(`life-seat-1-${delta}`)
      const label = view.getByText(delta === -1 ? "−" : "+")
      expect(button.props.accessibilityRole).toBe("button")
      expect(button.props.accessibilityLabel).toContain("Seat 1, Ada")
      expect(button.props.accessibilityHint).toContain("Long press for more controls")
      expect(label.props.maxFontSizeMultiplier).toBe(1.3)
      expect(label.props.adjustsFontSizeToFit).toBeUndefined()
      expect(label.props.numberOfLines).toBe(1)
      fireEvent(button, "pressIn")
      fireEvent.press(button)
      fireEvent(button, "pressIn")
      fireEvent(button, "longPress")
      fireEvent.press(button)
    }
    expect(onChange.mock.calls.map(([delta]) => delta)).toEqual([-1, 1])
    expect(onOpenEditor).toHaveBeenCalledTimes(2)
  })

  it("opens the editor from a tap on the total without changing life", () => {
    const onChange = jest.fn()
    const onOpenEditor = jest.fn()
    const controls = (props: { disabled?: boolean; lockedReason?: string }) => (
      <ThemeProvider initialContext="light">
        <LifeControls
          playerName="Ada"
          totalInk={{ width: 154, height: 86, y: -5 }}
          onChange={onChange}
          onOpenEditor={onOpenEditor}
          {...props}
        />
      </ThemeProvider>
    )
    const view = render(controls({}))
    fireEvent(view.getByTestId("life-control-zones"), "layout", {
      nativeEvent: { layout: { width: 400, height: 300 } },
    })
    const total = view.getByTestId("life-total-target-seat-1")
    expect(total.props.accessibilityLabel).toBe("Seat 1, Ada, more life controls")
    fireEvent.press(total)
    expect(onOpenEditor).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()

    view.rerender(controls({ lockedReason: "Out" }))
    expect(view.queryByTestId("life-total-target-seat-1")).toBeNull()
    view.rerender(controls({ disabled: true }))
    expect(view.queryByTestId("life-total-target-seat-1")).toBeNull()
  })

  it.each([
    [0, { left: 113, top: 92, width: 174, height: 106 }],
    [180, { left: 113, top: 102, width: 174, height: 106 }],
    [90, { left: 152, top: 63, width: 106, height: 174 }],
    [-90, { left: 142, top: 63, width: 106, height: 174 }],
  ] as const)("covers a total turned %i° where it inks", (rotation, box) => {
    expect(
      totalTargetBox({ width: 154, height: 86, y: -5 }, { width: 400, height: 300 }, rotation, 1),
    ).toEqual(box)
  })

  it("keeps ±1 reachable as full card halves rather than small buttons", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" onChange={jest.fn()} />
      </ThemeProvider>,
    )
    for (const delta of [-1, 1] as const) {
      expect(
        StyleSheet.flatten(view.getByTestId(`life-seat-1-${delta}`).props.style),
      ).toMatchObject({ flex: 1 })
    }
  })

  it.each(PLAYER_COLORS)("inks the − and + readably on %s", (color) => {
    const foreground = accessibleForeground(color)
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls
          playerName="Ada"
          contrastCheckedForeground={foreground}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    for (const glyph of ["−", "+"]) {
      const { color: ink, opacity = 1 } = StyleSheet.flatten(view.getByText(glyph).props.style)
      expect(opacity).toBe(1)
      expect(contrastRatio(String(ink), color)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("marks every control disabled together", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" disabled onChange={jest.fn()} />
      </ThemeProvider>,
    )
    for (const delta of [-1, 1] as const) {
      expect(view.getByTestId(`life-seat-1-${delta}`).props.accessibilityState.disabled).toBe(true)
    }
  })

  it("keeps a wide sideways delta inside the card edge", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls
          playerName="Ada"
          system="ygo"
          contentRotation={90}
          recentDelta={{ get: () => 1000, subscribe: () => () => {} }}
          lifeFontSize={52}
          lifeDigits={4}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-control-zones"), "layout", {
      nativeEvent: { layout: { width: 193, height: 388 } },
    })
    const { transform } = StyleSheet.flatten(view.getByText("+1000").props.style)
    expect(transform[0].translateY).toBeLessThan(0)
    expect(transform[1]).toEqual({ rotate: "90deg" })
  })

  it("uses Yu-Gi-Oh! Life Point increments", () => {
    const onChange = jest.fn()
    const onOpenEditor = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeControls
          playerName="Yugi"

          system="ygo"
          onChange={onChange}
          onOpenEditor={onOpenEditor}
        />
      </ThemeProvider>,
    )

    const subtract = view.getByTestId("life-seat-1--1000")
    fireEvent.press(subtract)
    fireEvent(subtract, "pressIn")
    fireEvent(subtract, "longPress")

    expect(subtract.props.accessibilityLabel).toContain("subtract 1000 Life Points")
    expect(onChange).toHaveBeenCalledWith(-1000)
    expect(onOpenEditor).toHaveBeenCalledTimes(1)
  })

  it("uses the change amount saved on the game", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeControls playerName="Ada" system="mtg" lifeStep={5} onChange={onChange} />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("life-seat-1-5"))
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it("uses Prize card language for Pokémon", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <LifeControls playerName="Red" system="pokemon" onChange={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByTestId("life-seat-1--1").props.accessibilityLabel).toContain(
      "subtract 1 Prize card",
    )
  })

  it("turns sideways controls toward each player's outside edge", () => {
    const left = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" contentRotation={90} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(StyleSheet.flatten(left.getByTestId("life-control-zones").props.style)).toMatchObject({
      flexDirection: "column",
    })

    const right = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Grace" contentRotation={-90} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(StyleSheet.flatten(right.getByTestId("life-control-zones").props.style)).toMatchObject({
      flexDirection: "column-reverse",
    })
  })

  it("pins sideways glyphs to the outer edges clear of the rotated life total", () => {
    const left = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" contentRotation={90} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(StyleSheet.flatten(left.getByTestId("life-seat-1--1").props.style)).toMatchObject({
      justifyContent: "flex-start",
      alignItems: "center",
    })
    expect(StyleSheet.flatten(left.getByTestId("life-seat-1-1").props.style)).toMatchObject({
      justifyContent: "flex-end",
      alignItems: "center",
    })

    const right = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Grace" contentRotation={-90} onChange={jest.fn()} />
      </ThemeProvider>,
    )
    expect(StyleSheet.flatten(right.getByTestId("life-seat-1--1").props.style)).toMatchObject({
      justifyContent: "flex-end",
      alignItems: "center",
    })
    expect(StyleSheet.flatten(right.getByTestId("life-seat-1-1").props.style)).toMatchObject({
      justifyContent: "flex-start",
      alignItems: "center",
    })
  })

  it("keeps the − centered beside a commander grid on a 4-player phone seat", () => {
    const window = Dimensions.get("window")
    Dimensions.set({ window: { ...window, fontScale: 1 } })
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls
          playerName="Ada"
          contentRotation={90}
          obstacle={{ edge: "top", bounds: { x: 12, y: 12, width: 62, height: 62 } }}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent(view.getByTestId("life-control-zones"), "layout", {
      nativeEvent: { layout: { width: 185, height: 404 } },
    })
    const style = StyleSheet.flatten(view.getByTestId("life-seat-1--1").props.style)
    Dimensions.set({ window })
    expect(style.paddingLeft).toBeUndefined()
    expect(style.paddingRight).toBeUndefined()
  })
})

describe("glyphSlide", () => {
  const sidewaysSeat = { width: 200, height: 420 }

  it("slides a sideways glyph along its edge past a grid that reaches the middle of its end", () => {
    const grid = { x: 8, y: 8, width: 90, height: 70 }
    expect(glyphSlide({ edge: "top", bounds: grid }, sidewaysSeat, 50, 4)).toEqual({
      paddingLeft: 2 * (98 + 4 + 25) - 200,
    })
  })

  it("leaves the glyph alone when the grid stays in its corner", () => {
    const grid = { x: 8, y: 8, width: 60, height: 70 }
    expect(glyphSlide({ edge: "top", bounds: grid }, sidewaysSeat, 50, 4)).toBeUndefined()
  })
})
