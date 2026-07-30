import { StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Button, ButtonProps } from "./Button"

type NestedButtonContentKey = Extract<
  "tx" | "text" | "txOptions" | "children",
  keyof NonNullable<ButtonProps["TextProps"]>
>
type NestedButtonContentIsExcluded = [NestedButtonContentKey] extends [never] ? true : false

describe("Button", () => {
  it("keeps nested text overrides presentation-only", () => {
    const nestedButtonContentIsExcluded: NestedButtonContentIsExcluded = true

    expect(nestedButtonContentIsExcluded).toBe(true)
  })

  it("applies a visible default disabled treatment and keeps caller overrides", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Button
          testID="disabled-button"
          text="Unavailable"
          disabled
          style={$buttonOverride}
          disabledStyle={$disabledOverride}
          disabledTextStyle={$disabledTextOverride}
        />
      </ThemeProvider>,
    )

    const button = view.getByTestId("disabled-button")
    const buttonStyle = StyleSheet.flatten(button.props.style)
    const textStyle = StyleSheet.flatten(view.getByText("Unavailable").props.style)

    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
    expect(buttonStyle).toEqual(
      expect.objectContaining({
        borderRadius: 12,
        borderStyle: "dashed",
        marginTop: 7,
        opacity: expect.any(Number),
      }),
    )
    expect(buttonStyle.opacity).toBeLessThan(1)
    expect(textStyle).toEqual(expect.objectContaining({ letterSpacing: 2 }))
  })

  it("merges disabled semantics with caller-supplied accessibility state", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Button
          testID="selected-disabled-button"
          text="Selected"
          disabled
          accessibilityState={{ selected: true }}
        />
      </ThemeProvider>,
    )
    expect(view.getByTestId("selected-disabled-button").props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    })
  })
})

const $buttonOverride = { marginTop: 7 }
const $disabledOverride = { borderRadius: 12 }
const $disabledTextOverride = { letterSpacing: 2 }
