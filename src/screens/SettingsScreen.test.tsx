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
})
