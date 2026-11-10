import type { ViewStyle } from "react-native"

import type {
  LifeCardContentRotation,
  LifeCardEdge,
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

/** why: mirrors TurnChipLayer, which drops a head's beside control when the pentagon is centered on that head's top edge; the seam carries the control exactly then, or it shows twice or not at all. */
export function headChipCrowded(teamCount: number, layout: GridLayout, slot: number, head: 0 | 1) {
  const rows = getPlayerGridRows(teamCount, layout)
  const panel = panelBoxes(
    rows,
    rows.map((row) => getPlayerGridRowFlex(row, layout)),
  ).get(slot)
  const rotation = getPlayerSlotFacings(teamCount, layout)[slot]
  if (!panel || rotation === undefined) return false
  const { edgeCenter } = menuPlacementAt(
    headBox(panel, rotation, head),
    getPlayerGridMenuAnchor(teamCount, layout),
  )
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

const MENU_CLEARANCE = 48
const TOWARD_CENTER: Record<LifeCardContentRotation, { x: number; y: number }> = {
  0: { x: 0, y: -1 },
  180: { x: 0, y: 1 },
  90: { x: 1, y: 0 },
  [-90]: { x: -1, y: 0 },
}

export interface TeamRivet {
  x: number
  y: number
  size: number
}

export function teamRivet(
  panel: { width: number; height: number },
  rotation: LifeCardContentRotation,
  compact: boolean | undefined,
  menuAtSeam: boolean,
): TeamRivet {
  const size = compact ? 24 : 28
  const sideways = Math.abs(rotation) === 90
  const depth = sideways ? panel.width : panel.height
  const headRun = (sideways ? panel.height : panel.width) / 2
  const wanted = depth * (headRun < depth ? 0.25 : 0.2)
  const shift = Math.max(
    0,
    menuAtSeam ? Math.min(wanted, depth / 2 - MENU_CLEARANCE - size / 2) : wanted,
  )
  const toward = TOWARD_CENTER[rotation]
  return { x: toward.x * shift, y: toward.y * shift, size }
}

export function teamRivets(
  teamCount: number,
  layout: GridLayout,
  board: { width: number; height: number },
  anchor: { x: number; y: number },
): TeamRivet[] {
  const rows = getPlayerGridRows(teamCount, layout)
  const facings = getPlayerSlotFacings(teamCount, layout)
  const boxes = panelBoxes(
    rows,
    rows.map((row) => getPlayerGridRowFlex(row, layout)),
  )
  return [...boxes].map(([slot, box]) => {
    const offset = teamRivet(
      { width: (box.x1 - box.x0) * board.width, height: (box.y1 - box.y0) * board.height },
      facings[slot],
      teamPanelCompact(layout, teamCount),
      menuPlacementAt(box, anchor).edgeCenter !== undefined,
    )
    return {
      x: ((box.x0 + box.x1) / 2) * board.width + offset.x,
      y: ((box.y0 + box.y1) / 2) * board.height + offset.y,
      size: offset.size,
    }
  })
}
