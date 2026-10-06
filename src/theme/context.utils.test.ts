import { setBackgroundColorAsync } from "expo-system-ui"

import { overrideSystemUIBackgroundColor, setImperativeTheming } from "./context.utils"
import { darkTheme, lightTheme } from "./theme"

jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn() }))

const lastColor = () => jest.mocked(setBackgroundColorAsync).mock.lastCall?.[0]

describe("overrideSystemUIBackgroundColor", () => {
  it("holds the override across theme changes and restores the current theme", () => {
    setImperativeTheming(lightTheme)
    const restore = overrideSystemUIBackgroundColor("#000000")
    setImperativeTheming(darkTheme)
    expect(lastColor()).toBe("#000000")
    setImperativeTheming(lightTheme)
    restore()
    expect(lastColor()).toBe(lightTheme.colors.background)
  })

  it("ignores a stale restore once a newer override is active", () => {
    setImperativeTheming(lightTheme)
    const restoreFirst = overrideSystemUIBackgroundColor("#111111")
    const restoreSecond = overrideSystemUIBackgroundColor("#222222")
    restoreFirst()
    expect(lastColor()).toBe("#222222")
    restoreSecond()
    expect(lastColor()).toBe(lightTheme.colors.background)
  })
})
