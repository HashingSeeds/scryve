import { Alert, Linking } from "react-native"
import * as WebBrowser from "expo-web-browser"

import { APPLE_STANDARD_EULA_URL, openAppleStandardEula } from "./legalLinks"

jest.mock("expo-web-browser", () => ({
  ...jest.requireActual("expo-web-browser"),
  openBrowserAsync: jest.fn(),
}))

const openBrowser = jest.mocked(WebBrowser.openBrowserAsync)

describe("openAppleStandardEula", () => {
  afterEach(() => jest.restoreAllMocks())

  it("opens the EULA in the in-app browser", async () => {
    openBrowser.mockResolvedValueOnce({ type: WebBrowser.WebBrowserResultType.DISMISS })
    const openURL = jest.spyOn(Linking, "openURL")

    await openAppleStandardEula()

    expect(openBrowser).toHaveBeenCalledWith(APPLE_STANDARD_EULA_URL)
    expect(openURL).not.toHaveBeenCalled()
  })

  it("shows the URL when no browser can open it", async () => {
    openBrowser.mockRejectedValueOnce(new Error("no browser"))
    const openURL = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("refused"))
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {})

    await openAppleStandardEula()

    expect(openURL).toHaveBeenCalledWith(APPLE_STANDARD_EULA_URL)
    expect(alert).toHaveBeenCalledWith(expect.any(String), APPLE_STANDARD_EULA_URL)
  })
})
