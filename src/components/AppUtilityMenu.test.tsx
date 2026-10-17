import { StyleSheet } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { setNearbyOnly } from "@/features/lan/nearbyOnly"
import { ThemeProvider } from "@/theme/context"

import { AppUtilityMenu } from "./AppUtilityMenu"
import { GameMenuBackdrop } from "./GameRadialMenu"
import { mockHardwareBack } from "../../test/support/hardwareBack"

let mockNearbyPlay = false
jest.mock("@/features/lan/lanAvailability", () => ({ lanPlayAvailable: () => mockNearbyPlay }))

beforeEach(() => {
  mockNearbyPlay = false
  setNearbyOnly(false)
})

describe("AppUtilityMenu", () => {
  it("closes on Android Back before the game menu it opened from", () => {
    const pressBack = mockHardwareBack()
    const closeGameMenu = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <GameMenuBackdrop open onClose={closeGameMenu} />
        <AppUtilityMenu onSettings={jest.fn()} onAccount={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("utility-menu-button"))

    act(() => void pressBack())

    expect(view.getByTestId("utility-menu-button")).toBeTruthy()
    expect(closeGameMenu).not.toHaveBeenCalled()

    act(() => void pressBack())

    expect(closeGameMenu).toHaveBeenCalledTimes(1)
    jest.restoreAllMocks()
  })

  it("turns the utility button into its actions, hiding the trigger from screen readers", () => {
    const onSettings = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu accountEntry="signIn" onSettings={onSettings} onAccount={jest.fn()} />
      </ThemeProvider>,
    )

    expect(view.getByLabelText("More")).toBeTruthy()
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

  it("lets a nearby tester cut this device off from Convex, and remembers it", () => {
    mockNearbyPlay = true
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu compact onSettings={jest.fn()} onAccount={jest.fn()} />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("utility-menu-button"))
    expect(StyleSheet.flatten(view.getByTestId("utility-menu-slot").props.style)).toMatchObject({
      width: 176,
      height: 162,
    })

    fireEvent.press(view.getByText("Nearby only: Off"))
    fireEvent.press(view.getByTestId("utility-menu-button"))

    expect(view.getByText("Nearby only: On")).toBeTruthy()
    expect(view.getByTestId("utility-nearby-only-button").props.accessibilityState).toEqual({
      checked: true,
    })
  })

  it("only reports closing when a visible menu is actually open", () => {
    const onOpenHeightChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          visible={false}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
          onOpenHeightChange={onOpenHeightChange}
        />
      </ThemeProvider>,
    )

    expect(onOpenHeightChange).not.toHaveBeenCalled()

    view.rerender(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          visible
          onSettings={jest.fn()}
          onAccount={jest.fn()}
          onOpenHeightChange={onOpenHeightChange}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("utility-menu-button"))
    onOpenHeightChange.mockClear()
    view.rerender(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          visible={false}
          onSettings={jest.fn()}
          onAccount={jest.fn()}
          onOpenHeightChange={onOpenHeightChange}
        />
      </ThemeProvider>,
    )

    expect(onOpenHeightChange).toHaveBeenCalledTimes(1)
    expect(onOpenHeightChange).toHaveBeenCalledWith(0)
  })
})
