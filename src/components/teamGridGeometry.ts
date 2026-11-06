import type { ViewStyle } from "react-native"

import type {
  LifeCardContentRotation,
  LifeCardEdge,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import { getPlayerGridLayout } from "./playerGridGeometry"

type GridLayout = ReturnType<typeof getPlayerGridLayout>

/**
 * why: a Two-Headed Giant board seats teams the way a smaller game seats players, one panel per
 * team. Two teams face each other across the long sides, so both heads of a team share the
 * edge they sit along instead of crowding a short end.
 */
export function teamGridLayout(input: Parameters<typeof getPlayerGridLayout>[0]): GridLayout {
  const layout = getPlayerGridLayout(input)
  if (input.playerCount !== 2 || layout.layout !== "two-stacked") return layout
  return { ...layout, layout: "two-side-by-side", columnCount: 2, rowCount: 1 }
}

export function teamSplit(
  rotation: LifeCardContentRotation,
): NonNullable<ViewStyle["flexDirection"]> {
  if (rotation === 90) return "column"
  if (rotation === -90) return "column-reverse"
  if (rotation === 180) return "row-reverse"
  return "row"
}

const SEAM: Record<ReturnType<typeof teamSplit>, readonly [LifeCardEdge, LifeCardEdge]> = {
  "row": ["right", "left"],
  "row-reverse": ["left", "right"],
  "column": ["bottom", "top"],
  "column-reverse": ["top", "bottom"],
}

export const seamEdge = (rotation: LifeCardContentRotation, head: 0 | 1) =>
  SEAM[teamSplit(rotation)][head]

export interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
}

export function headBox(panel: Box, rotation: LifeCardContentRotation, head: 0 | 1): Box {
  const split = teamSplit(rotation)
  const second = split.endsWith("reverse") ? head === 0 : head === 1
  if (split.startsWith("row")) {
    const middle = (panel.x0 + panel.x1) / 2
    return second ? { ...panel, x0: middle } : { ...panel, x1: middle }
  }
  const middle = (panel.y0 + panel.y1) / 2
  return second ? { ...panel, y0: middle } : { ...panel, y1: middle }
}

export function panelBoxes(
  rows: readonly (readonly (number | null)[])[],
  rowFlexes: readonly number[],
) {
  const total = rowFlexes.reduce((sum, flex) => sum + flex, 0)
  const boxes = new Map<number, Box>()
  let top = 0
  rows.forEach((row, rowIndex) => {
    const bottom = top + rowFlexes[rowIndex] / total
    row.forEach((slot, column) => {
      if (slot !== null)
        boxes.set(slot, {
          x0: column / row.length,
          x1: (column + 1) / row.length,
          y0: top,
          y1: bottom,
        })
    })
    top = bottom
  })
  return boxes
}

const NEAR = 0.01
const near = (a: number, b: number) => Math.abs(a - b) < NEAR

/** why: the menu sits where panels meet, which lands on a head's corner or the middle of one of its edges. */
export function menuPlacementAt(
  box: Box,
  anchor: { x: number; y: number },
): { corner?: LifeCardMenuCorner; edgeCenter?: LifeCardMenuEdge } {
  const x = near(anchor.x, box.x0) ? "Left" : near(anchor.x, box.x1) ? "Right" : undefined
  const y = near(anchor.y, box.y0) ? "top" : near(anchor.y, box.y1) ? "bottom" : undefined
  if (x && y) return { corner: `${y}${x}` }
  if (y && near(anchor.x, (box.x0 + box.x1) / 2)) return { edgeCenter: y }
  if (x && near(anchor.y, (box.y0 + box.y1) / 2))
    return { edgeCenter: x === "Left" ? "left" : "right" }
  return {}
}

/**
 * why: commander damage draws a small map of the board, one cell per seat. Heads stacked down a
 * panel take a row each and heads side by side share one, so the map matches where people sit.
 */
export function teamSeatRows(
  rows: readonly (readonly (number | null)[])[],
  rowFlexes: readonly number[],
  rotationAt: (rowIndex: number, columnIndex: number) => LifeCardContentRotation,
  heads: (slot: number) => readonly [number, number] | undefined,
): { rows: (number | null)[][]; flexes: number[] } {
  const seated: (number | null)[][] = []
  const flexes: number[] = []
  rows.forEach((row, rowIndex) => {
    const stacked = row.every(
      (slot, column) => slot === null || Math.abs(rotationAt(rowIndex, column)) === 90,
    )
    const ordered = row.map((slot, column): readonly [number | null, number | null] => {
      const pair = slot === null ? undefined : heads(slot)
      if (!pair) return [null, null]
      return teamSplit(rotationAt(rowIndex, column)).endsWith("reverse") ? [pair[1], pair[0]] : pair
    })
    if (stacked) {
      seated.push(
        ordered.map(([top]) => top),
        ordered.map(([, bottom]) => bottom),
      )
      flexes.push(rowFlexes[rowIndex] / 2, rowFlexes[rowIndex] / 2)
    } else {
      seated.push(ordered.flatMap((pair) => [...pair]))
      flexes.push(rowFlexes[rowIndex])
    }
  })
  return { rows: seated, flexes }
}
