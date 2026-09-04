import { StyleSheet } from "react-native"
import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { FloatingAppNavigation } from "./FloatingAppNavigation"

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
