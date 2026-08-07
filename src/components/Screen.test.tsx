import { ScrollView, StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

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
})
