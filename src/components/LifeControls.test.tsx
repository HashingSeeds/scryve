import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { LifeControls } from "./LifeControls"

describe("LifeControls", () => {
  it("maps taps to one life and delegates long presses to custom amount editing", () => {
    const onChange = jest.fn()
    const onLongChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" onChange={onChange} onLongChange={onLongChange} />
      </ThemeProvider>,
    )
    for (const delta of [-1, 1] as const) {
      const button = view.getByTestId(`life-seat-1-${delta}`)
      const label = view.getByText(delta === -1 ? "−" : "+")
      expect(button.props.accessibilityRole).toBe("button")
      expect(button.props.accessibilityLabel).toContain("Seat 1, Ada")
      expect(button.props.accessibilityHint).toContain("Long press to enter a custom amount")
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
    expect(onLongChange.mock.calls.map(([direction]) => direction)).toEqual([-1, 1])
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
})
