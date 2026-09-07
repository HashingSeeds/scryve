import { Platform } from "react-native"
import * as Clipboard from "expo-clipboard"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { SettingsScreen } from "./SettingsScreen"

const mockApp = {
  nativeApplicationVersion: "1.2.3" as string | null,
  nativeBuildVersion: "42" as string | null,
}
const mockUpdates = {
  isEnabled: true,
  isEmbeddedLaunch: false,
  runtimeVersion: "abcdef1234567890abcdef1234567890" as string | null,
  updateId: "12345678-abcd-4321-abcd-123456789012" as string | null,
  channel: "preview" as string | null,
}
jest.mock("expo-application", () => ({
  __esModule: true,
  get nativeApplicationVersion() {
    return mockApp.nativeApplicationVersion
  },
  get nativeBuildVersion() {
    return mockApp.nativeBuildVersion
  },
}))
jest.mock("expo-updates", () => ({
  __esModule: true,
  get isEnabled() {
    return mockUpdates.isEnabled
  },
  get isEmbeddedLaunch() {
    return mockUpdates.isEmbeddedLaunch
  },
  get runtimeVersion() {
    return mockUpdates.runtimeVersion
  },
  get updateId() {
    return mockUpdates.updateId
  },
  get channel() {
    return mockUpdates.channel
  },
}))
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }))

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockApp.nativeApplicationVersion = "1.2.3"
    mockApp.nativeBuildVersion = "42"
    Object.assign(mockUpdates, {
      isEnabled: true,
      isEmbeddedLaunch: false,
      runtimeVersion: "abcdef1234567890abcdef1234567890",
      updateId: "12345678-abcd-4321-abcd-123456789012",
      channel: "preview",
    })
    jest.mocked(Clipboard.setStringAsync).mockReset().mockResolvedValue(true)
  })

  it("shows installed metadata and copies full identifiers", async () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Version: 1.2.3")).toBeTruthy()
    expect(view.getByText("Build: 42")).toBeTruthy()
    expect(view.getByText("Runtime: abcdef123456…")).toBeTruthy()
    expect(view.getByText("Update: 12345678-abc…")).toBeTruthy()
    fireEvent.press(view.getByText("Copy debug info"))
    await waitFor(() => expect(view.getByText("Copied")).toBeTruthy())
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      [
        "Scryve",
        "Version: 1.2.3",
        "Build: 42",
        `Runtime: ${mockUpdates.runtimeVersion}`,
        `Update: ${mockUpdates.updateId}`,
        "Channel: preview",
        `Platform: ${Platform.OS}`,
      ].join("\n"),
    )
  })

  it("distinguishes bundled launches from development and missing metadata", () => {
    mockUpdates.isEmbeddedLaunch = true
    mockApp.nativeBuildVersion = null
    mockApp.nativeApplicationVersion = null
    mockUpdates.runtimeVersion = null
    mockUpdates.channel = null
    const screen = (
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
        />
      </ThemeProvider>
    )
    const view = render(screen)
    expect(view.getByText("Update: Bundled")).toBeTruthy()
    expect(view.getByText("Version: Unavailable")).toBeTruthy()
    expect(view.getByText("Build: Unavailable")).toBeTruthy()
    expect(view.getByText("Runtime: Unavailable")).toBeTruthy()
    mockUpdates.isEnabled = false
    view.rerender(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    expect(view.getByText("Update: Development")).toBeTruthy()
  })

  it.each(["denied", "rejected"])("allows retry when clipboard access is %s", async (failure) => {
    if (failure === "denied") jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false)
    else
      jest
        .mocked(Clipboard.setStringAsync)
        .mockRejectedValueOnce(new Error("Clipboard unavailable"))
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={jest.fn()}
        />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByText("Copy debug info"))
    await waitFor(() => expect(view.getByText("Could not copy. Try again.")).toBeTruthy())
    fireEvent.press(view.getByText("Copy debug info"))
    await waitFor(() => expect(view.getByText("Copied")).toBeTruthy())
  })

  it("marks native-only metadata as not applicable on web", () => {
    const platform = jest.replaceProperty(Platform, "OS", "web")
    mockApp.nativeApplicationVersion = null
    mockApp.nativeBuildVersion = null
    Object.assign(mockUpdates, { isEnabled: false, runtimeVersion: null, channel: null })
    try {
      const view = render(
        <ThemeProvider initialContext="dark">
          <SettingsScreen
            initialSettings={DEFAULT_LOCAL_SETTINGS}
            onBack={jest.fn()}
            onSettingsChange={jest.fn()}
          />
        </ThemeProvider>,
      )
      expect(view.getByText("Build: Not applicable")).toBeTruthy()
      expect(view.getByText("Runtime: Not applicable")).toBeTruthy()
      expect(view.getByText("Channel: Not applicable")).toBeTruthy()
    } finally {
      platform.restore()
    }
  })

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
    fireEvent.press(view.getByTestId("default-player-count-increment"))
    fireEvent.press(view.getByTestId("default-starting-life-increment"))
    fireEvent.press(view.getByTestId("haptics-switch"))
    fireEvent.press(view.getByText("Dark"))
    fireEvent.press(view.getByTestId("menu-button-style-prismFlat"))
    fireEvent.press(view.getByTestId("launch-destination-decks"))
    expect(onSettingsChange).toHaveBeenCalledTimes(6)
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultPlayerCount: 3,
        defaultStartingLife: 21,
        hapticsEnabled: false,
        themePreference: "dark",
        menuButtonStyle: "prismFlat",
        launchDestination: "decks",
      }),
    )
  })

  it("steps player count and starting life within their bounds", () => {
    const onSettingsChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={{ ...DEFAULT_LOCAL_SETTINGS, defaultPlayerCount: 2 }}
          onBack={jest.fn()}
          onSettingsChange={onSettingsChange}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("default-player-count-decrement"))
    expect(onSettingsChange).not.toHaveBeenCalled()

    fireEvent(view.getByTestId("default-starting-life-increment"), "longPress")
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultStartingLife: 30 }),
    )
  })

  it("leaves the default system and format unset until they are chosen", () => {
    const onSettingsChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={onSettingsChange}
        />
      </ThemeProvider>,
    )

    expect(DEFAULT_LOCAL_SETTINGS.defaultSystem).toBeUndefined()
    expect(DEFAULT_LOCAL_SETTINGS.defaultFormat).toBeUndefined()
    expect(view.queryByTestId("default-format")).toBeNull()

    fireEvent.press(view.getByTestId("default-system-mtg"))
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultSystem: "mtg" }),
    )
    expect(onSettingsChange.mock.calls[0][0].defaultFormat).toBeUndefined()

    fireEvent.press(view.getByTestId("default-format"))
    fireEvent.press(view.getByTestId("default-format-option-commander"))
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultSystem: "mtg", defaultFormat: "commander" }),
    )
    expect(view.getByLabelText("Format, Commander")).toBeTruthy()

    fireEvent.press(view.getByTestId("default-system-none"))
    const last = onSettingsChange.mock.calls.at(-1)?.[0]
    expect(last.defaultSystem).toBeUndefined()
    expect(last.defaultFormat).toBeUndefined()
    expect(last.defaultStartingLife).toBe(20)
    expect(view.queryByTestId("default-format")).toBeNull()
  })

  it("uses the selected system's starting value and counter steps", () => {
    const onSettingsChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={DEFAULT_LOCAL_SETTINGS}
          onBack={jest.fn()}
          onSettingsChange={onSettingsChange}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("default-system-ygo"))
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultSystem: "ygo", defaultStartingLife: 8000 }),
    )
    expect(view.getByText("8000")).toBeTruthy()
    expect(view.getByText("Life Points")).toBeTruthy()

    fireEvent.press(view.getByTestId("default-starting-life-increment"))
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultStartingLife: 8100 }),
    )
  })

  it("updates the life default for a format while preserving custom life", () => {
    const onSettingsChange = jest.fn()
    const view = render(
      <ThemeProvider initialContext="dark">
        <SettingsScreen
          initialSettings={{ ...DEFAULT_LOCAL_SETTINGS, defaultSystem: "mtg" }}
          onBack={jest.fn()}
          onSettingsChange={onSettingsChange}
        />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("default-format"))
    fireEvent.press(view.getByTestId("default-format-option-commander"))
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultFormat: "commander", defaultStartingLife: 40 }),
    )

    fireEvent.press(view.getByTestId("default-starting-life-decrement"))
    fireEvent.press(view.getByTestId("default-format"))
    fireEvent.press(view.getByTestId("default-format-option-standard"))
    expect(onSettingsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultFormat: "standard", defaultStartingLife: 39 }),
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
