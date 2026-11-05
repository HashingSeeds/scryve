import type { Insets } from "react-native"

import type { LifeCardEdge } from "./playerCardTypes"

const MIN_TARGET = 48

/** why: a control drawn under 48 dp reaches it through hit slop. Touches past a card's edge never arrive, so where `room` runs out on one side the rest of the slop goes to the other. */
export function targetSlop(
  size: { width: number; height: number },
  room: Partial<Record<LifeCardEdge, number>> = {},
  least = 0,
): Insets {
  const axis = (length: number, near: LifeCardEdge, far: LifeCardEdge) => {
    const total = Math.max(least, (MIN_TARGET - length) / 2) * 2
    const first = Math.min(total / 2, room[near] ?? Infinity)
    const second = Math.min(total - first, room[far] ?? Infinity)
    return [Math.min(total - second, room[near] ?? Infinity), second]
  }
  const [top, bottom] = axis(size.height, "top", "bottom")
  const [left, right] = axis(size.width, "left", "right")
  return { top, bottom, left, right }
}
