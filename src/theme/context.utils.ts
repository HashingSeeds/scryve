import type { Theme } from "./types"

const systemui = require("expo-system-ui")

export const setSystemUIBackgroundColor = (color: string) => {
  if (systemui) {
    systemui.setBackgroundColorAsync(color)
  }
}

let themeBackgroundColor: string | undefined
let backgroundOverride: { color: string } | undefined

/**
 * Set the app's native background color to match the theme.
 * This is only available if the app has installed expo-system-ui
 *
 * @param theme The theme object to use for the background color
 */
export const setImperativeTheming = (theme: Theme) => {
  themeBackgroundColor = theme.colors.background
  setSystemUIBackgroundColor(backgroundOverride?.color ?? themeBackgroundColor)
}

export const overrideSystemUIBackgroundColor = (color: string) => {
  const override = { color }
  backgroundOverride = override
  setSystemUIBackgroundColor(color)
  return () => {
    if (backgroundOverride !== override) return
    backgroundOverride = undefined
    if (themeBackgroundColor) setSystemUIBackgroundColor(themeBackgroundColor)
  }
}
