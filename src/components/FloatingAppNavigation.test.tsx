import { Platform, StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ThemeProvider } from "@/theme/context"

import { FloatingAppNavigation } from "./FloatingAppNavigation"

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, right: 0, bottom: 34, left: 0 })),
}))

it.each([
  ["ios", 34, 34],
  ["ios", 0, 16],
  ["android", 0, 16],
  ["android", 24, 24],
] as const)("positions navigation on %s with inset %i at %i points", (platform, inset, bottom) => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 0, right: 0, bottom: inset, left: 0 })
  const original = Platform.OS
  Platform.OS = platform
  try {
    const view = render(
      <ThemeProvider initialContext="dark">
        <FloatingAppNavigation
          destinationLabel="Decks"
          onDestination={jest.fn()}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )
    const style = StyleSheet.flatten(view.getByTestId("floating-app-navigation").props.style)
    expect((style.bottom ?? 0) + (style.marginBottom ?? 0)).toBe(bottom)
  } finally {
    Platform.OS = original
  }
})

describe("FloatingAppNavigation", () => {
  it("expands its hit area without moving the destination button", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <FloatingAppNavigation
          destinationLabel="Return to game"
          onDestination={jest.fn()}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )

    const navigation = view.getByTestId("floating-app-navigation")
    expect(StyleSheet.flatten(navigation.props.style)).toMatchObject({
      height: 48,
      justifyContent: "flex-end",
    })
    expect(StyleSheet.flatten(view.getByTestId("open-decks-button").props.style)).toMatchObject({
      marginBottom: 2,
    })

    fireEvent.press(view.getByTestId("utility-menu-button"))

    expect(StyleSheet.flatten(navigation.props.style)).toMatchObject({ height: 108 })
  })
})
