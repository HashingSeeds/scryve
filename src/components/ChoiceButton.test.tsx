import { StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { contrastRatio } from "@/utils/colorContrast"

import { ChoiceButton } from "./ChoiceButton"

const PLAYER_COLOR = "#41476E"

describe.each(["light", "dark"] as const)("ChoiceButton in the %s theme", (mode) => {
  it.each([true, false])("keeps the label and detail readable when selected is %s", (selected) => {
    const view = render(
      <ThemeProvider initialContext={mode}>
        <ChoiceButton testID="choice" text="Ada" detail="5 life" selected={selected} />
      </ThemeProvider>,
    )

    const background = StyleSheet.flatten(view.getByTestId("choice").props.style)
      .backgroundColor as string
    const label = StyleSheet.flatten(view.getByText("Ada").props.style)
    const detail = StyleSheet.flatten(view.getByText("5 life").props.style)

    expect(view.getByTestId("choice").props.accessibilityState).toEqual(
      expect.objectContaining({ selected }),
    )
    expect(contrastRatio(label.color as string, background)).toBeGreaterThan(4.5)
    expect(contrastRatio(detail.color as string, background)).toBeGreaterThan(4.5)
  })

  it("fills the row with the player color and keeps that label readable", () => {
    const view = render(
      <ThemeProvider initialContext={mode}>
        <ChoiceButton testID="choice" text="Ada" accentColor={PLAYER_COLOR} selected />
      </ThemeProvider>,
    )

    const row = StyleSheet.flatten(view.getByTestId("choice").props.style)
    const label = StyleSheet.flatten(view.getByText("Ada").props.style)

    expect(row.backgroundColor).toBe(PLAYER_COLOR)
    expect(row.borderColor).toBe(PLAYER_COLOR)
    expect(contrastRatio(label.color as string, PLAYER_COLOR)).toBeGreaterThan(4.5)
  })

  it("distinguishes the selected state by fill, border, and check mark", () => {
    const view = render(
      <ThemeProvider initialContext={mode}>
        <ChoiceButton testID="off" text="Ada" selected={false} />
        <ChoiceButton testID="on" text="Grace" selected />
      </ThemeProvider>,
    )

    const off = StyleSheet.flatten(view.getByTestId("off").props.style)
    const on = StyleSheet.flatten(view.getByTestId("on").props.style)

    expect(on.backgroundColor).not.toBe(off.backgroundColor)
    expect(on.borderColor).not.toBe(off.borderColor)
    expect(on.borderWidth).toBe(off.borderWidth)
    expect(view.getByTestId("choice-check-on")).toBeTruthy()
    expect(view.getByTestId("choice-check-off")).toBeTruthy()
  })
})
