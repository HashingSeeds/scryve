import { ScrollView, StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { Screen } from "./Screen"
import { Text } from "./Text"

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

  it("keeps navigation fixed and reveals its title after the body heading scrolls away", () => {
    const onBack = jest.fn()
    const onScroll = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <Screen
          preset="auto"
          header={{ title: "Settings", leftText: "Back", onLeftPress: onBack }}
          ScrollViewProps={{ testID: "screen-scroll", onScroll }}
        >
          <Text text="Settings" />
        </Screen>
      </ThemeProvider>,
    )

    expect(view.getAllByText("Settings")).toHaveLength(1)

    fireEvent.scroll(view.getByTestId("screen-scroll"), {
      nativeEvent: { contentOffset: { y: 400 } },
    })

    expect(view.getAllByText("Settings")).toHaveLength(2)
    expect(onScroll).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByText("Back"))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("shows a fixed screen's header title immediately", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <Screen preset="fixed" header={{ title: "Game" }} />
      </ThemeProvider>,
    )

    expect(view.getByText("Game")).toBeTruthy()
  })
})
