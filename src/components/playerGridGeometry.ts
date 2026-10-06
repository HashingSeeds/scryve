import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"

import type { LifeCardContentRotation } from "./playerCardTypes"

const SINGLE_PLAYER_ROW_FLEX = 0.8

export function getPlayerGridRows(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): (number | null)[][] {
  const seats = Array.from({ length: playerCount }, (_, index) => index)
  if (layout.variant === "tabletop")
    return [[0], ...chunkSeats(seats.slice(1, -1), 2), [playerCount - 1]]
  if (layout.variant === "featured-first") return [[0], ...chunkSeats(seats.slice(1), 2)]
  if (layout.variant === "featured-last")
    return [...chunkSeats(seats.slice(0, -1), 2), [playerCount - 1]]
  if (layout.variant === "even-grid") return chunkSeats(seats, 2, true)
  if (layout.layout === "three-featured") return [[0], [1, 2]]
  return chunkSeats(seats, layout.columnCount)
}

/** why: pass topInset (a fraction of board height) when PlayerGrid pads the board top, so the anchor still lands on the card seam. */
export function getPlayerGridMenuAnchor(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
  topInset = 0,
): { x: number; y: number } {
  const rows = getPlayerGridRows(playerCount, layout)
  const rowFlexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const totalRowFlex = rowFlexes.reduce((total, flex) => total + flex, 0)
  let cumulativeFlex = 0
  const boundaryPositions = rowFlexes.slice(0, -1).map((flex) => {
    cumulativeFlex += flex
    return topInset + (cumulativeFlex / totalRowFlex) * (1 - topInset)
  })
  const junction = getFourCardMenuJunction(rows)
  if (junction)
    return {
      x: junction.column / junction.columnCount,
      y: boundaryPositions[junction.boundary - 1],
    }
  return {
    x: 0.5,
    y: boundaryPositions[getCentralMenuBoundary(rows, layout) - 1] ?? topInset + (1 - topInset) / 2,
  }
}

export function getCentralMenuBoundary(
  rows: (number | null)[][],
  layout: ReturnType<typeof getPlayerGridLayout>,
) {
  const flexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const total = flexes.reduce((sum, flex) => sum + flex, 0)
  let position = 0
  let nearest = { boundary: 1, distance: Infinity }
  for (let index = 0; index < rows.length - 1; index += 1) {
    position += flexes[index] / total
    const distance = Math.abs(position - 0.5)
    if (distance < nearest.distance) nearest = { boundary: index + 1, distance }
  }
  return nearest.boundary
}

export function getFourCardMenuJunction(rows: (number | null)[][]) {
  for (let boundary = rows.length - 1; boundary > 0; boundary -= 1) {
    const upper = rows[boundary - 1]
    const lower = rows[boundary]
    const columnCount = Math.max(upper.length, lower.length)
    for (let column = columnCount - 1; column > 0; column -= 1) {
      const fourCardsMeet = [
        upper[column - 1],
        upper[column],
        lower[column - 1],
        lower[column],
      ].every((seat) => seat !== null && seat !== undefined)
      if (fourCardsMeet) return { boundary, column, columnCount }
    }
  }
  return null
}

export function getPlayerGridRowFlex(
  row: (number | null)[],
  layout: ReturnType<typeof getPlayerGridLayout>,
): number {
  if (row.length !== 1 || layout.columnCount === 1) return 1
  return SINGLE_PLAYER_ROW_FLEX
}

export function getPlayerContentRotation(input: {
  playerCount: number
  layout: ReturnType<typeof getPlayerGridLayout>
  row: (number | null)[]
  rowIndex: number
  columnIndex: number
  playerIndex: number
}): LifeCardContentRotation {
  if (input.playerCount === 2 && input.layout.layout === "two-stacked")
    return input.playerIndex === 0 ? 180 : 0

  const occupiedColumns = input.row.flatMap((seat, column) => (seat === null ? [] : [column]))
  if (occupiedColumns.length === 1) return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
  if (input.columnIndex === occupiedColumns[0]) return 90
  if (input.columnIndex === occupiedColumns[occupiedColumns.length - 1]) return -90
  return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
}

export function chunkSeats(
  seats: number[],
  columnCount: number,
  fillLastRow = false,
): (number | null)[][] {
  const rows: (number | null)[][] = []
  for (let index = 0; index < seats.length; index += columnCount) {
    const row: (number | null)[] = seats.slice(index, index + columnCount)
    if (fillLastRow) {
      while (row.length < columnCount) row.push(null)
    }
    rows.push(row)
  }
  return rows
}

export function getPlayerGridLayout(input: {
  playerCount: number
  width: number
  height: number
  fontScale?: number
  layoutVariant?: PlayerGridLayoutVariant
}) {
  const landscape = input.width > input.height
  const tablet = Math.min(input.width, input.height) >= 600
  const largeText = (input.fontScale ?? 1) >= 1.4
  const automaticColumnCount =
    input.playerCount === 2
      ? landscape
        ? 2
        : 1
      : input.playerCount === 3 && landscape
        ? 3
        : input.playerCount >= 5 && landscape
          ? 3
          : 2
  const variant = playerGridLayoutForCount(input.playerCount, input.layoutVariant)
  const columnCount =
    variant === "featured-first" ||
    variant === "featured-last" ||
    variant === "even-grid" ||
    variant === "tabletop"
      ? 2
      : automaticColumnCount
  const rowCount =
    variant === "tabletop"
      ? 2 + Math.ceil((input.playerCount - 2) / 2)
      : variant === "featured-first" || variant === "featured-last"
        ? 1 + Math.ceil((input.playerCount - 1) / 2)
        : variant === "even-grid"
          ? Math.ceil(input.playerCount / 2)
          : input.playerCount === 3 && !landscape
            ? 2
            : Math.ceil(input.playerCount / columnCount)
  const layout =
    input.playerCount === 2
      ? landscape
        ? "two-side-by-side"
        : "two-stacked"
      : input.playerCount === 3
        ? landscape
          ? "three-tabletop"
          : "three-featured"
        : input.playerCount === 4
          ? "four-grid"
          : landscape
            ? "dense-landscape"
            : "dense-portrait"
  const availableHeight = Math.max(input.height - 132, 300)
  const baseCellHeight = Math.max(148, Math.floor(availableHeight / rowCount))
  const minCellHeight = largeText ? Math.ceil(baseCellHeight * 1.25) : baseCellHeight
  return {
    variant,
    columnCount,
    rowCount,
    layout,
    minCellHeight,
    compact: input.playerCount >= 5 || baseCellHeight < 280,
    landscape,
    tablet,
    largeText,
  }
}
