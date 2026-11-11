import type { ViewStyle } from "react-native"

import type {
  LifeCardContentRotation,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import {
  CONTENT_EDGES,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
  getPlayerSlotFacings,
} from "./playerGridGeometry"

type GridLayout = ReturnType<typeof getPlayerGridLayout>

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

export interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
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

/** why: mirrors LifeCard, which drops a team zone's mode control from its turn chip when the pentagon is centered on the zone's top edge; the seam carries the control exactly then, or it shows twice or not at all. */
export function teamChipCrowded(teamCount: number, layout: GridLayout, slot: number) {
  const rows = getPlayerGridRows(teamCount, layout)
  const panel = panelBoxes(
    rows,
    rows.map((row) => getPlayerGridRowFlex(row, layout)),
  ).get(slot)
  const rotation = getPlayerSlotFacings(teamCount, layout)[slot]
  if (!panel || rotation === undefined) return false
  const { edgeCenter } = menuPlacementAt(panel, getPlayerGridMenuAnchor(teamCount, layout))
  return edgeCenter === CONTENT_EDGES[rotation].top
}

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

export const teamPanelCompact = (layout: GridLayout, teamCount: number) =>
  layout.compact || teamCount >= 3

/** why: each teammate's strip runs along one end of the zone, wide enough for a counter chip, so the zone's − and + and the seam's plates keep clear of it. */
export const teamStripWidth = (compact?: boolean) => (compact ? 40 : 46)
