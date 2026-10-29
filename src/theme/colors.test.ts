import { colors as lightColors } from "./colors"
import { colors as darkColors } from "./colorsDark"
import { accessibleForeground, contrastRatio } from "../utils/colorContrast"

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
