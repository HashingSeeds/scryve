import { createContext, useContext } from "react"

import type { CornerRadii, DisplayCorners } from "../../modules/display-corners"

export const BoardCornerRadiiContext = createContext<CornerRadii | null>(null)

export const useBoardCornerRadii = () => useContext(BoardCornerRadiiContext)

/**
 * why: a pinned board stays upright on the hardware while the window turns under it, so its corners
 * meet the display's in the hardware's frame, not the window's. Corner i of the board faces window
 * corner (i + turns) % 4, the same rule ScreenPinnedView uses for its insets.
 */
export function boardCornerRadii(
  display: DisplayCorners | null,
  board: { pinned: boolean; holderAngle: number },
): CornerRadii | null {
  if (!display) return null
  const { radii } = display
  // why: iOS unpins only a window smaller than the screen (Split View, Stage Manager), whose corners are not the display's.
  if (display.frame === "upright") return board.pinned ? radii : null
  if (!board.pinned) return radii
  const turns = ((((-board.holderAngle / 90) | 0) % 4) + 4) % 4
  const at = (corner: number) => radii[(corner + turns) % 4]
  return [at(0), at(1), at(2), at(3)]
}
