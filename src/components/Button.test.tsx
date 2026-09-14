import { StyleSheet, View } from "react-native"
import { render } from "@testing-library/react-native"

import { colors as lightColors } from "@/theme/colors"
import { colors as darkColors } from "@/theme/colorsDark"
import { ThemeProvider } from "@/theme/context"
import { contrastRatio } from "@/utils/colorContrast"

import { Button, ButtonProps } from "./Button"

type NestedButtonContentKey = Extract<
  "tx" | "text" | "txOptions" | "children",
  keyof NonNullable<ButtonProps["TextProps"]>
>
type NestedButtonContentIsExcluded = [NestedButtonContentKey] extends [never] ? true : false

describe("Button", () => {
  it.each(["light", "dark"] as const)(
    "uses the theme tint and readable labels for primary actions in %s mode",
    (mode) => {
      const themeColors = mode === "dark" ? darkColors : lightColors
      const content = (disabled: boolean) => (
        <ThemeProvider initialContext={mode}>
          <Button testID="primary-action" text="Keep mine" preset="primary" disabled={disabled} />
        </ThemeProvider>
      )
      const view = render(content(false))
      for (const disabled of [false, true]) {
        view.rerender(content(disabled))
        const button = StyleSheet.flatten(view.getByTestId("primary-action").props.style)
        const label = StyleSheet.flatten(view.getByText("Keep mine").props.style)
        expect(button.backgroundColor).toBe(themeColors.tint)
        expect(button.opacity ?? 1).toBe(disabled ? 0.55 : 1)
        expect(
          contrastRatio(label.color as string, button.backgroundColor as string),
        ).toBeGreaterThanOrEqual(4.5)
        expect(view.getByTestId("primary-action").props.accessibilityState.disabled).toBe(disabled)
      }
    },
  )

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
        borderStyle: "solid",
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

  it("passes resolved view styles to accessories", () => {
    const accessory = jest.fn(({ style }) => <View testID="button-accessory" style={style} />)
    const view = render(
      <ThemeProvider initialContext="light">
        <Button text="Continue" RightAccessory={accessory} />
      </ThemeProvider>,
    )

    expect(StyleSheet.flatten(view.getByTestId("button-accessory").props.style)).toMatchObject({
      marginStart: 8,
      zIndex: 1,
    })
  })

  it.each(["light", "dark"] as const)(
    "keeps a disabled primary button readable and unstruck in the %s theme",
    (mode) => {
      const view = render(
        <ThemeProvider initialContext={mode}>
          <Button testID="cta" text="Start game" preset="reversed" disabled />
        </ThemeProvider>,
      )

      const button = StyleSheet.flatten(view.getByTestId("cta").props.style)
      const label = StyleSheet.flatten(view.getByText("Start game").props.style)

      expect(label.textDecorationLine).toBeUndefined()
      expect(button.borderStyle).toBeUndefined()
      expect(
        contrastRatio(label.color as string, button.backgroundColor as string),
      ).toBeGreaterThan(4.5)
    },
  )
})

const $buttonOverride = { marginTop: 7 }
const $disabledOverride = { borderRadius: 12 }
const $disabledTextOverride = { letterSpacing: 2 }
