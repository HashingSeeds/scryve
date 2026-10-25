import { Alert, Linking } from "react-native"
import * as Clipboard from "expo-clipboard"

import { openUrl } from "./openUrl"

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }))

function copyButton(alert: jest.SpyInstance) {
  const buttons: { text: string; onPress?: () => void }[] = alert.mock.calls[0][2]
  return buttons.find((button) => button.text === "Copy")
}

describe("openUrl", () => {
  afterEach(() => jest.restoreAllMocks())

  it("shows the support address with Copy when no mail app can send it", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("no mail app"))
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {})

    await openUrl("mailto:support@sowinghope.how?subject=Scryve%20Support")

    expect(alert).toHaveBeenCalledWith(
      "No mail app found",
      "support@sowinghope.how",
      expect.any(Array),
    )
    copyButton(alert)?.onPress?.()
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("support@sowinghope.how")
  })

  it("shows a link nothing can open", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("refused"))
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {})

    await openUrl("https://example.test/rules")

    expect(alert).toHaveBeenCalledWith(
      "Couldn't open this link",
      "https://example.test/rules",
      expect.any(Array),
    )
  })

  it("stays quiet when the link opens", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValueOnce(true)
    const alert = jest.spyOn(Alert, "alert")

    await openUrl("https://example.test/rules")

    expect(alert).not.toHaveBeenCalled()
  })
})
