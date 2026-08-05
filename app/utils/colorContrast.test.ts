import { PLAYER_COLORS } from "@/features/game/domain"

import { accessibleForeground, contrastRatio } from "./colorContrast"

describe("life card contrast", () => {
  it("uses white text for every default player color", () => {
    expect(PLAYER_COLORS.map(accessibleForeground)).toEqual(PLAYER_COLORS.map(() => "#FFFFFF"))
  })

  it.each([...PLAYER_COLORS, "#FFFFFF", "#000000", "#777777", "#00FF00"])(
    "chooses readable text for %s",
    (background) => {
      expect(contrastRatio(background, accessibleForeground(background))).toBeGreaterThanOrEqual(
        4.5,
      )
    },
  )
})
