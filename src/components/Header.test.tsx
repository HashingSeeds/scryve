import { StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Header } from "./Header"

jest.mock("@/i18n/translate", () => ({
  translate: (key: string) => (key === "common:back" ? "Back" : key),
}))

describe("Header", () => {
  it("exposes translated text actions as 56-point buttons with explicit state", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Header
          title="New game"
          leftTx="common:back"
          onLeftPress={jest.fn()}
          rightText="Unavailable"
        />
      </ThemeProvider>,
    )

    const back = view.getByLabelText("Back")
    const unavailable = view.getByLabelText("Unavailable")
    expect(back.props.accessibilityRole).toBe("button")
    expect(back.props.accessibilityState).toEqual({ disabled: false })
    expect(StyleSheet.flatten(back.props.style).height).toBe("100%")
    expect(unavailable.props.accessibilityRole).toBe("button")
    expect(unavailable.props.accessibilityState).toEqual({ disabled: true })
  })
})
