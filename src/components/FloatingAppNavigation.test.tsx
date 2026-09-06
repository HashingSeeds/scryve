import { Platform, StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FloatingAppNavigation } from "./FloatingAppNavigation"

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}))

it.each([
  ["ios", 0],
  ["android", 16],
] as const)(
  "positions bottom navigation on %s without changing safe-area clearance",
  (platform, bottom) => {
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
      expect(view.getByTestId("floating-app-navigation")).toHaveStyle({ bottom, marginBottom: 34 })
    } finally {
      Platform.OS = original
    }
  },
)

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
