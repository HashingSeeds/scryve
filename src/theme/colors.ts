import type { GameMenuActionKind } from "./gameMenu"

const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#F4F2F1",
  neutral300: "#D7CEC9",
  neutral400: "#B6ACA6",
  neutral500: "#978F8A",
  neutral600: "#564E4A",
  neutral700: "#3C3836",
  neutral800: "#191015",
  neutral900: "#000000",

  primary100: "#F4E0D9",
  primary200: "#E8C1B4",
  primary300: "#DDA28E",
  primary400: "#D28468",
  primary500: "#C76542",
  primary600: "#A54F31",

  secondary100: "#DCDDE9",
  secondary500: "#41476E",

  accent100: "#FFEED4",
  accent200: "#FFE1B2",
  accent300: "#FDD495",
  accent400: "#FBC878",
  accent500: "#FFBB50",

  angry100: "#F2D6CD",
  angry500: "#C03403",

  success500: "#39755C",
  info500: "#41476E",
  destructive500: "#A33A52",

  overlay50: "rgba(25, 16, 21, 0.5)",
} as const

export const colors = {
  /**
   * The palette is available to use, but prefer using the name.
   * This is only included for rare, one-off cases. Try to use
   * semantic names as much as possible.
   */
  palette,
  transparent: "rgba(0, 0, 0, 0)",
  text: palette.neutral800,
  textDim: palette.neutral600,
  background: palette.neutral200,
  border: palette.neutral400,
  tint: palette.primary500,
  /**
   * Brand-colored text with normal-text contrast against the app background.
   */
  brandText: palette.primary600,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,
  error: palette.angry500,
  errorBackground: palette.angry100,
  surface: palette.neutral100,
  surfaceRaised: palette.neutral100,
  overlay: palette.overlay50,
  shadow: palette.neutral900,
  success: palette.success500,
  board: {
    background: palette.neutral900,
    surface: palette.neutral800,
    surfaceRaised: palette.neutral700,
    border: palette.neutral600,
    text: palette.neutral100,
  },
  gameMenu: {
    signal: {
      slow: "#E8C1B4",
      offline: "#FFBB50",
      catchingUp: "#FFFFFF",
      caughtUp: "#55C894",
      attention: "#E5482A",
    },
    backdrop: "rgba(0, 0, 0, 0.56)",
    anchor: palette.neutral800,
    anchorBorder: palette.neutral100,
    anchorGlyph: palette.neutral100,
    shadow: palette.neutral900,
    actions: {
      "layout": palette.primary600,
      "dice": palette.success500,
      "players": "#77558A",
      "status": palette.info500,
      "home": "#356A86",
      "setup": "#80602A",
      "history": "#6B4A63",
      "connect": "#236B63",
      "invite": "#2F6E8C",
      "end-game": palette.angry500,
    } satisfies Record<GameMenuActionKind, string>,
  },
} as const
