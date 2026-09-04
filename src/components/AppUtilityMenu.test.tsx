import { StyleSheet } from "react-native"
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

    expect(view.getByTestId("utility-menu-dots")).toBeTruthy()
    expect(view.queryByText("Settings")).toBeNull()
    expect(view.queryByText("Account")).toBeNull()
    fireEvent.press(view.getByTestId("utility-menu-button"))
    expect(view.getByText("Settings")).toBeTruthy()
    expect(view.getByText("Account")).toBeTruthy()
  })

  it("expands the compact hit-test slot with the menu", () => {
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

    expect(StyleSheet.flatten(view.getByTestId("utility-menu-slot").props.style)).toMatchObject({
      width: 44,
      height: 44,
    })

    fireEvent.press(view.getByTestId("utility-menu-button"))

    expect(StyleSheet.flatten(view.getByTestId("utility-menu-slot").props.style)).toMatchObject({
      width: 148,
      height: 108,
    })
  })

  it("only reports closing when a visible menu is actually open", () => {
    const onOpenChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          visible={false}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
          onOpenChange={onOpenChange}
        />
      </ThemeProvider>,
    )

    expect(onOpenChange).not.toHaveBeenCalled()

    view.rerender(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          visible
          onSettings={jest.fn()}
          onAccount={jest.fn()}
          onOpenChange={onOpenChange}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("utility-menu-button"))
    onOpenChange.mockClear()
    view.rerender(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          visible={false}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
          onOpenChange={onOpenChange}
        />
      </ThemeProvider>,
    )

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
