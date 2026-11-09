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
  if (display.frame === "upright") {
    if (board.pinned) return radii
    // why: an unpinned board turns with the window, and iOS knows only the upright corners, so only a display whose corners all match can be placed.
    return radii.every((radius) => radius === radii[0]) ? radii : null
  }
  if (!board.pinned) return radii
  const turns = ((((-board.holderAngle / 90) | 0) % 4) + 4) % 4
  const at = (corner: number) => radii[(corner + turns) % 4]
  return [at(0), at(1), at(2), at(3)]
}

/** why: a card corner set in from the glass by `inset` follows the display's curve one inset in, so it stays parallel to the glass. */
export const concentricRadius = (radius: number | null, inset = 0) =>
  radius === null ? null : Math.max(0, radius - inset)
