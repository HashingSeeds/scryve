import { fireEvent, render } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { SettingsScreen } from "./SettingsScreen"

describe("SettingsScreen", () => {
  it("exposes the two shipping menu button treatments", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    for (const style of ["keystoneIIFlat", "prismFlat"]) {
      expect(view.getByTestId(`menu-button-style-${style}`)).toBeTruthy()
    }
  })

  it("changes local defaults, haptics, and theme", () => {
    const onSettingsChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={onSettingsChange}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByLabelText("Default 6 players"))
    fireEvent.press(view.getByLabelText("Default 40 life"))
    fireEvent.press(view.getByTestId("haptics-switch"))
    fireEvent.press(view.getByText("Dark"))
    fireEvent.press(view.getByTestId("menu-button-style-prismFlat"))
    expect(onSettingsChange).toHaveBeenCalledTimes(5)
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultPlayerCount: 6,
        defaultStartingLife: 40,
        hapticsEnabled: false,
        themePreference: "dark",
        menuButtonStyle: "prismFlat",
      }),
    )
  })

  it("keeps Back reachable and reveals the title after scrolling", () => {
    const onBack = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={onBack}
          onSettingsChange={jest.fn()}
        />
      </ThemeProvider>,
    )

    expect(view.getAllByText("Settings")).toHaveLength(1)

    fireEvent.scroll(view.getByTestId("settings-scroll"), {
      nativeEvent: { contentOffset: { y: 400 } },
    })
    expect(view.getAllByText("Settings")).toHaveLength(2)

    fireEvent.press(view.getByText(/^(Back|common:back)$/))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("exposes every web legal document", () => {
    const handlers = {
      onOpenPrivacy: jest.fn(),
      onOpenTerms: jest.fn(),
      onOpenCookiePolicy: jest.fn(),
      onOpenGameContentNotices: jest.fn(),
    }
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
          {...handlers}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("Privacy Policy"))
    fireEvent.press(view.getByText("Terms of Use"))
    fireEvent.press(view.getByText("Cookie Policy"))
    fireEvent.press(view.getByText("Third-party game content"))

    expect(handlers.onOpenPrivacy).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenTerms).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenCookiePolicy).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenGameContentNotices).toHaveBeenCalledTimes(1)
    expect(view.queryByText("License Agreement")).toBeNull()
  })

  it("opens the help page when a handler is provided", () => {
    const onOpenSupport = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
          onOpenSupport={onOpenSupport}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("Help & support"))
    expect(onOpenSupport).toHaveBeenCalledTimes(1)
  })

  it("exposes the license agreement when a handler is provided", () => {
    const onOpenLicenseAgreement = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
          onOpenPrivacy={jest.fn()}
          onOpenTerms={jest.fn()}
          onOpenLicenseAgreement={onOpenLicenseAgreement}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("License Agreement"))
    expect(onOpenLicenseAgreement).toHaveBeenCalledTimes(1)
  })
})
