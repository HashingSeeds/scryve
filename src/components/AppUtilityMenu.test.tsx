import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppUtilityMenu } from "./AppUtilityMenu"

describe("AppUtilityMenu", () => {
  it("turns the utility button into its actions, hiding the trigger from screen readers", () => {
    const onSettings = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu accountLabel="Sign in" onSettings={onSettings} onAccount={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByTestId("utility-menu-button").props.accessibilityState.expanded).toBe(false)
    fireEvent.press(view.getByTestId("utility-menu-button"))
    expect(view.queryByTestId("utility-menu-button")).toBeNull()
    expect(
      view.getByTestId("utility-menu-button", { includeHiddenElements: true }).props
        .accessibilityState.expanded,
    ).toBe(true)
    expect(view.getByText("Sign in")).toBeTruthy()
    fireEvent.press(view.getByTestId("utility-settings-button"))
    expect(onSettings).toHaveBeenCalledTimes(1)
  })

  it("supports the compact bottom-left version, hiding actions until opened", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          compact
          placement="bottomLeft"
          onSettings={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByText("•••")).toBeTruthy()
    expect(view.queryByText("Settings")).toBeNull()
    expect(view.queryByText("Account")).toBeNull()
    fireEvent.press(view.getByTestId("utility-menu-button"))
    expect(view.getByText("Settings")).toBeTruthy()
    expect(view.getByText("Account")).toBeTruthy()
  })
})
