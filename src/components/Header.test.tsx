import { Dimensions, StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Header } from "./Header"

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

  it("insets a centered title past the wider action so neither covers it", () => {
    const window = Dimensions.get("window")
    Dimensions.set({ window: { ...window, fontScale: 1 } })
    const view = render(
      <ThemeProvider initialContext="light">
        <Header title="Third-party game content" leftTx="common:back" onLeftPress={jest.fn()} />
      </ThemeProvider>,
    )
    const titleInset = () => {
      let node = view.getByText("Third-party game content").parent
      while (node && StyleSheet.flatten(node.props.style)?.paddingHorizontal === undefined) {
        node = node.parent
      }
      return StyleSheet.flatten(node?.props.style)?.paddingHorizontal
    }
    expect(titleInset()).toBe(48)

    act(() => {
      fireEvent(view.getByLabelText("Back"), "layout", {
        nativeEvent: { layout: { width: 72.4 } },
      })
    })

    expect(titleInset()).toBe(73)
    act(() => Dimensions.set({ window }))
  })
})
