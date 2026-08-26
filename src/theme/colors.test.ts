import { colors as lightColors } from "./colors"
import { colors as darkColors } from "./colorsDark"
import { accessibleForeground } from "../utils/colorContrast"

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`)
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))

  return (lighter + 0.05) / (darker + 0.05)
}

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
] as const)("%s theme", (_name, colors) => {
  it("keeps brand text readable on the app background", () => {
    expect(contrastRatio(colors.brandText, colors.background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(colors.gameMenu.actions))(
    "keeps the %s menu action readable",
    (_tone, background) => {
      expect(contrastRatio(accessibleForeground(background), background)).toBeGreaterThanOrEqual(
        4.5,
      )
    },
  )
})
