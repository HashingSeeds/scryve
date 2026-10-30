import { colors as colorsLight } from "./colors"
import { colors as colorsDark } from "./colorsDark"
import { radius } from "./radius"
import { spacing as spacingLight } from "./spacing"
import type { Theme } from "./types"
import { typography } from "./typography"

export const lightTheme: Theme = {
  colors: colorsLight,
  spacing: spacingLight,
  radius,
  typography,
  isDark: false,
}
export const darkTheme: Theme = {
  colors: colorsDark,
  spacing: spacingLight,
  radius,
  typography,
  isDark: true,
}
