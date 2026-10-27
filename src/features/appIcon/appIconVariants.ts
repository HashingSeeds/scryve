const SEAT_COLORS = ["#B85636", "#41476E", "#39755C", "#94632D"] as const
const GOLD = ["#FFF1BF", "#D9A93A", "#FFE59A", "#9C6D16"] as const
const PRISM = ["#F6E7B0", "#FFC2D9", "#C9B8FF", "#9FE6FF", "#C8F7C5"] as const
const HOLO = ["#F6E7B0", "#FFFFFF", "#B9E9FF", "#E6C2FF", "#F3D27A"] as const

export type Paint = string | readonly string[]

export type AppIconSpec = {
  name: string
  tier: "pro" | "foil"
  background: string
  tiles: readonly Paint[]
  darkTwin?: string
  button?: Paint
  buttonRing?: Paint
  lines?: Paint
  sheen?: boolean
  outline?: number
  innerRing?: string
  stripes?: boolean
  glow?: boolean
  grid?: boolean
}

/** why: app.config.ts builds the native icon sets from this list and scripts/app-icons.ts draws the art from it, so names and colors live in one place. The tile count picks the board layout, matching the in-game board for that many players. */
export const APP_ICON_VARIANTS = [
  { name: "Two", tier: "pro", background: "#000000", tiles: SEAT_COLORS.slice(0, 2) },
  { name: "Three", tier: "pro", background: "#000000", tiles: SEAT_COLORS.slice(0, 3) },
  {
    name: "Midnight",
    tier: "pro",
    background: "#060A1C",
    tiles: ["#3B4F9A", "#26336B", "#1E2A58", "#31438A"],
    button: "#0E1430",
    lines: "#DCE3FF",
  },
  {
    name: "Graphite",
    tier: "pro",
    background: "#000000",
    tiles: ["#6B6B6B", "#3F3F44", "#545458", "#5E5E60"],
  },
  {
    name: "Ink",
    tier: "pro",
    background: "#000000",
    tiles: ["#F4F2F1", "#F4F2F1", "#F4F2F1", "#F4F2F1"],
    outline: 12,
    button: "#F4F2F1",
    lines: "#000000",
  },
  { name: "Outline", tier: "pro", background: "#000000", tiles: SEAT_COLORS, outline: 12 },
  { name: "Bone", tier: "pro", background: "#F4F2F1", tiles: SEAT_COLORS },
  { name: "Paper", tier: "pro", background: "#F4F2F1", tiles: SEAT_COLORS, outline: 15 },
  {
    name: "Ash",
    tier: "pro",
    background: "#F4F2F1",
    tiles: ["#76767B", "#505055", "#636368", "#87878C"],
  },
  {
    name: "Pencil",
    tier: "pro",
    background: "#F4F2F1",
    tiles: ["#4A4A4F", "#4A4A4F", "#4A4A4F", "#4A4A4F"],
    outline: 9,
    innerRing: "#9A9A9E",
    button: "#F4F2F1",
    buttonRing: "#4A4A4F",
    lines: "#36333D",
    darkTwin: "Contour",
  },
  {
    name: "Foil",
    tier: "foil",
    background: "#000000",
    tiles: SEAT_COLORS,
    sheen: true,
  },
  {
    name: "Contour",
    tier: "pro",
    background: "#000000",
    tiles: ["#9A9A9E", "#9A9A9E", "#9A9A9E", "#9A9A9E"],
    outline: 9,
    innerRing: "#4A4A4F",
    button: "#000000",
    buttonRing: "#9A9A9E",
  },
  { name: "Stripes", tier: "pro", background: "#000000", tiles: SEAT_COLORS, stripes: true },
  {
    name: "Neon",
    tier: "pro",
    background: "#06060C",
    tiles: ["#FF8A63", "#9AA3FF", "#6BF0BC", "#FFC76B"],
    outline: 8,
    glow: true,
    button: "#06060C",
    buttonRing: "#F4F2F1",
  },
  {
    name: "Blueprint",
    tier: "pro",
    background: "#1A4C86",
    tiles: ["#DCEBFA", "#DCEBFA", "#DCEBFA", "#DCEBFA"],
    outline: 10,
    grid: true,
    button: "#1A4C86",
    buttonRing: "#DCEBFA",
    lines: "#DCEBFA",
  },
  {
    name: "Gilded",
    tier: "foil",
    background: "#000000",
    tiles: [GOLD, GOLD, GOLD, GOLD],
    outline: 10,
    button: GOLD,
    lines: "#000000",
  },
  {
    name: "Prism",
    tier: "foil",
    background: "#000000",
    tiles: [PRISM, PRISM, PRISM, PRISM],
    button: "#000000",
  },
  {
    name: "Holo",
    tier: "foil",
    background: "#000000",
    tiles: [HOLO, HOLO, HOLO, HOLO],
    outline: 10,
    button: "#000000",
    buttonRing: HOLO,
    lines: HOLO,
  },
] as const satisfies readonly AppIconSpec[]

export type AppIconVariant = (typeof APP_ICON_VARIANTS)[number]
export type AppIconName = AppIconVariant["name"]

export function appIconAssets(name: AppIconName) {
  const base = `./assets/images/app-icons/${name.toLowerCase()}`
  return {
    ios: `${base}-ios.png`,
    iosTinted: `${base}-ios-tinted.png`,
    androidForeground: `${base}-android-foreground.png`,
    androidMonochrome: `${base}-android-monochrome.png`,
  }
}
