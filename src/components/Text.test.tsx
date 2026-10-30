import { StyleSheet } from "react-native"
import { render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { darkTheme } from "@/theme/theme"

import { Text, type TextProps } from "./Text"

function colorOf(props: TextProps) {
  const view = render(
    <ThemeProvider initialContext="dark">
      <Text testID="text" text="Life" {...props} />
    </ThemeProvider>,
  )
  return StyleSheet.flatten(view.getByTestId("text").props.style).color
}

describe("Text tone", () => {
  it("dims the text", () => {
    expect(colorOf({ tone: "dim" })).toBe(darkTheme.colors.textDim)
  })

  it("yields to an explicit color", () => {
    expect(colorOf({ tone: "dim", style: { color: "red" } })).toBe("red")
  })
})
