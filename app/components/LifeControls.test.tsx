import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { LifeControls } from "./LifeControls"

describe("LifeControls", () => {
  const VISIBLE_LABEL_BY_DELTA = { "-5": "−5", "-1": "−", "1": "+", "5": "+5" } as const

  it("maps every explicit control to its additive delta with accessible labels", () => {
    const onChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <LifeControls playerName="Ada" onChange={onChange} />
      </ThemeProvider>,
    )
    for (const delta of [-5, -1, 1, 5] as const) {
      const button = view.getByTestId(`life-seat-1-${delta}`)
      const label = view.getByText(VISIBLE_LABEL_BY_DELTA[`${delta}`])
      expect(button.props.accessibilityRole).toBe("button")
      expect(button.props.accessibilityLabel).toContain("Seat 1, Ada")
      expect(label.props.maxFontSizeMultiplier).toBe(1.3)
      expect(label.props.adjustsFontSizeToFit).toBe(true)
      expect(label.props.numberOfLines).toBe(1)
      fireEvent.press(button)
    }
    expect(onChange.mock.calls.map(([delta]) => delta)).toEqual([-5, -1, 1, 5])
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
    for (const delta of [-5, -1, 1, 5] as const) {
      expect(view.getByTestId(`life-seat-1-${delta}`).props.accessibilityState.disabled).toBe(true)
    }
  })
})
