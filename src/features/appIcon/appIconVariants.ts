const SEAT_COLORS = ["#B85636", "#41476E", "#39755C", "#94632D"] as const

export type AppIconSpec = {
  name: string
  tier: "pro" | "foil"
  background: string
  tiles: readonly string[]
  button?: string
  lines?: string
  sheen?: boolean
  outline?: boolean
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
    outline: true,
    button: "#F4F2F1",
    lines: "#000000",
  },
  { name: "Outline", tier: "pro", background: "#000000", tiles: SEAT_COLORS, outline: true },
  { name: "Bone", tier: "pro", background: "#F4F2F1", tiles: SEAT_COLORS },
  {
    name: "Foil",
    tier: "foil",
    background: "#000000",
    tiles: SEAT_COLORS,
    sheen: true,
  },
] as const satisfies readonly AppIconSpec[]

export type AppIconVariant = (typeof APP_ICON_VARIANTS)[number]
export type AppIconName = AppIconVariant["name"]

export function appIconAssets(name: AppIconName) {
  const base = `./assets/images/app-icons/${name.toLowerCase()}`
  return {
    ios: `${base}-ios.png`,
    androidForeground: `${base}-android-foreground.png`,
  }
}
