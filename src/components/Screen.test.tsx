import { ScrollView, StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Screen } from "./Screen"

describe("Screen", () => {
  it("provides one shared readable content inset for form and list screens", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Screen preset="scroll" contentInset="standard" />
      </ThemeProvider>,
    )

    const scrollView = view.UNSAFE_getByType(ScrollView)
    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle)).toMatchObject({
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      paddingHorizontal: 24,
      paddingBottom: 32,
    })
  })

  it("recalculates auto scrolling after its threshold changes", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Screen preset="auto" scrollEnabledToggleThreshold={{ percent: 0.92 }} />
      </ThemeProvider>,
    )

    const scrollView = view.UNSAFE_getByType(ScrollView)
    fireEvent(scrollView, "layout", { nativeEvent: { layout: { height: 100 } } })
    fireEvent(scrollView, "contentSizeChange", 100, 95)
    expect(scrollView.props.scrollEnabled).toBe(true)

    view.rerender(
      <ThemeProvider initialContext="light">
        <Screen preset="auto" scrollEnabledToggleThreshold={{ percent: 1 }} />
      </ThemeProvider>,
    )

    expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(false)
  })
})
