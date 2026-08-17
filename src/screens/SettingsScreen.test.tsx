import { fireEvent, render } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { SettingsScreen } from "./SettingsScreen"

describe("SettingsScreen", () => {
  it("changes local defaults, haptics, and theme", () => {
    const onSave = jest.fn()
    const view = render(
      <ThemeProvider initialContext="light">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSave={onSave}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByLabelText("Default 6 players"))
    fireEvent.press(view.getByLabelText("Default 40 life"))
    fireEvent.press(view.getByTestId("haptics-switch"))
    fireEvent.press(view.getByText("Dark"))
    fireEvent.press(view.getByTestId("save-settings-button"))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPlayerCount: 6,
        defaultStartingLife: 40,
        hapticsEnabled: false,
        themePreference: "dark",
      }),
    )
  })

  it("exposes every web legal document", () => {
    const handlers = {
      onOpenPrivacy: jest.fn(),
      onOpenTerms: jest.fn(),
      onOpenCookiePolicy: jest.fn(),
    }
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSave={jest.fn()}
          {...handlers}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByText("Privacy Policy"))
    fireEvent.press(view.getByText("Terms of Use"))
    fireEvent.press(view.getByText("Cookie Policy"))

    expect(handlers.onOpenPrivacy).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenTerms).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenCookiePolicy).toHaveBeenCalledTimes(1)
    expect(view.queryByText("License Agreement")).toBeNull()
  })

  it("exposes the license agreement when a handler is provided", () => {
    const onOpenLicenseAgreement = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSave={jest.fn()}
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
