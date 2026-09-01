import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppUtilityMenu } from "./AppUtilityMenu"

describe("AppUtilityMenu", () => {
  it("turns the utility button into its actions and routes the selected item", () => {
    const onSettings = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu accountLabel="Sign in" onSettings={onSettings} onAccount={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByTestId("utility-menu-button").props.accessibilityState.expanded).toBe(false)
    fireEvent.press(view.getByTestId("utility-menu-button"))
    expect(view.getByTestId("utility-menu-button").props.accessibilityState.expanded).toBe(true)
    expect(view.getByText("Sign in")).toBeTruthy()
    fireEvent.press(view.getByTestId("utility-settings-button"))
    expect(onSettings).toHaveBeenCalledTimes(1)
  })
})
