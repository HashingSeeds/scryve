import { Linking, StyleSheet } from "react-native"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import { setNearbyOnly } from "@/features/lan/nearbyOnly"
import { ThemeProvider } from "@/theme/context"

import { AppUtilityMenu } from "./AppUtilityMenu"
import { GameMenuBackdrop } from "./GameRadialMenu"
import { mockHardwareBack } from "../../test/support/hardwareBack"

let mockNearbyPlay = false
jest.mock("@/features/lan/lanAvailability", () => ({ nearbyBetaAvailable: () => mockNearbyPlay }))
let mockStoreUpdate: { labelTx: "play:launch.openAppStore"; url: string } | null = null
jest.mock("@/features/updates/storeUpdate", () => ({
  ...jest.requireActual("@/features/updates/storeUpdate"),
  useStoreUpdate: () => mockStoreUpdate,
}))
const mockStartFlexibleUpdate = jest.fn()
jest.mock("../../modules/play-app-update", () => ({
  useDownloadedPlayVersion: () => null,
  startFlexibleUpdate: () => mockStartFlexibleUpdate(),
}))

beforeEach(() => {
  mockNearbyPlay = false
  mockStoreUpdate = null
  setNearbyOnly(false)
})

describe("AppUtilityMenu", () => {
  it("leads with a store update that downloads inside the app where Play allows it", async () => {
    mockStoreUpdate = { labelTx: "play:launch.openAppStore", url: "https://apps.example/scryve" }
    mockStartFlexibleUpdate.mockResolvedValue("started")
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getByLabelText("More, app update available")).toBeTruthy()
    expect(view.getByTestId("utility-update-dot")).toBeTruthy()
    fireEvent.press(view.getByTestId("utility-menu-button"))
    fireEvent.press(view.getByLabelText("Open App Store"))
    await act(() => Promise.resolve())

    expect(mockStartFlexibleUpdate).toHaveBeenCalledTimes(1)
    expect(openURL).not.toHaveBeenCalled()
    expect(view.getByTestId("utility-menu-button")).toBeTruthy()

    mockStartFlexibleUpdate.mockRejectedValue(new Error("ERROR_APP_NOT_OWNED"))
    fireEvent.press(view.getByTestId("utility-menu-button"))
    fireEvent.press(view.getByLabelText("Open App Store"))

    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1))
    openURL.mockRestore()
  })

  it("closes on Android Back before the game menu it opened from", () => {
    const pressBack = mockHardwareBack()
    const closeGameMenu = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <GameMenuBackdrop open onClose={closeGameMenu} />
        <AppUtilityMenu
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
        />
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
    const onSupport = jest.fn()
    const onHistory = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          accountEntry="signIn"
          onHistory={onHistory}
          onSettings={onSettings}
          onSupport={onSupport}
          onAccount={jest.fn()}
        />
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
    fireEvent.press(view.getByTestId("utility-menu-button"))
    fireEvent.press(view.getByTestId("utility-history-button"))
    expect(onHistory).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("utility-menu-button"))
    fireEvent.press(view.getByText("Support"))
    expect(onSupport).toHaveBeenCalledTimes(1)
  })

  it("supports the compact bottom-left version, hiding actions until opened", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          compact
          placement="bottomLeft"
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
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
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
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
      height: 216,
    })
  })

  it("lists Rules first and Settings last, growing to fit Rules", () => {
    mockNearbyPlay = true
    const onRules = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          compact
          onRules={onRules}
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("utility-menu-button"))

    expect(view.getAllByRole(/button|switch/).map((item) => item.props.testID)).toEqual([
      "utility-rules-button",
      "utility-history-button",
      "utility-nearby-only-button",
      "utility-account-button",
      "utility-support-button",
      "utility-settings-button",
    ])
    expect(StyleSheet.flatten(view.getByTestId("utility-menu-slot").props.style)).toMatchObject({
      height: 324,
    })
    fireEvent.press(view.getByTestId("utility-rules-button"))
    expect(onRules).toHaveBeenCalledTimes(1)
  })

  it("lets a nearby tester cut this device off from Convex, and remembers it", () => {
    mockNearbyPlay = true
    const view = render(
      <ThemeProvider initialContext="dark">
        <AppUtilityMenu
          compact
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("utility-menu-button"))
    expect(StyleSheet.flatten(view.getByTestId("utility-menu-slot").props.style)).toMatchObject({
      width: 176,
      height: 270,
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
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
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
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
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
          onHistory={jest.fn()}
          onSettings={jest.fn()}
          onSupport={jest.fn()}
          onAccount={jest.fn()}
          onOpenHeightChange={onOpenHeightChange}
        />
      </ThemeProvider>,
    )

    expect(onOpenHeightChange).toHaveBeenCalledTimes(1)
    expect(onOpenHeightChange).toHaveBeenCalledWith(0)
  })
})
