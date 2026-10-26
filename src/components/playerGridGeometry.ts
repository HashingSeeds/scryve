import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"

import type { LifeCardContentRotation } from "./playerCardTypes"

const SINGLE_PLAYER_ROW_FLEX = 0.8

const CENTER_COLUMN_SLOTS_WITH_PANEL_TOP_RIGHT = [
  [2, 4],
  [0, 5],
  [1, 3],
]

export function getPlayerGridRows(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): (number | null)[][] {
  const seats = Array.from({ length: playerCount }, (_, index) => index)
  if (layout.centerColumn === "panel-top-right") return CENTER_COLUMN_SLOTS_WITH_PANEL_TOP_RIGHT
  if (layout.centerColumn === "panel-top-left")
    return CENTER_COLUMN_SLOTS_WITH_PANEL_TOP_RIGHT.map((row) => [...row].reverse()).reverse()
  if (layout.variant === "tabletop")
    return [[0], ...chunkSeats(seats.slice(1, -1), 2), [playerCount - 1]]
  if (layout.variant === "featured-first") return [[0], ...chunkSeats(seats.slice(1), 2)]
  if (layout.variant === "featured-last")
    return [...chunkSeats(seats.slice(0, -1), 2), [playerCount - 1]]
  if (layout.variant === "even-grid") return chunkSeats(seats, 2, true)
  if (layout.layout === "three-featured") return [[0], [1, 2]]
  return chunkSeats(seats, layout.columnCount)
}

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

/** why: the table turn moves cards from these rects, so they match the flex rows PlayerGrid draws. */
export function getPlayerGridCellRects(input: {
  playerCount: number
  layout: ReturnType<typeof getPlayerGridLayout>
  board: { width: number; height: number }
  gap: number
  topInset?: number
}) {
  const { playerCount, layout, board, gap, topInset = 0 } = input
  const rows = getPlayerGridRows(playerCount, layout)
  const flexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const totalFlex = flexes.reduce((total, flex) => total + flex, 0)
  const rowsHeight = board.height - topInset - gap * (rows.length - 1)
  const rects = new Map<number, { x: number; y: number; width: number; height: number }>()
  let y = topInset
  rows.forEach((row, rowIndex) => {
    const height = (rowsHeight * flexes[rowIndex]) / totalFlex
    const width = (board.width - gap * (row.length - 1)) / row.length
    row.forEach((slot, column) => {
      if (slot !== null) rects.set(slot, { x: column * (width + gap), y, width, height })
    })
    y += height + gap
  })
  return rects
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
  slot: number
}): LifeCardContentRotation {
  if (input.playerCount === 2 && input.layout.layout === "two-stacked")
    return input.slot === 0 ? 180 : 0
  if (input.layout.centerColumn) {
    if (input.rowIndex === 0) return 180
    if (input.rowIndex === input.layout.rowCount - 1) return 0
    return input.columnIndex === 0 ? 90 : -90
  }

  const occupiedColumns = input.row.flatMap((seat, column) => (seat === null ? [] : [column]))
  if (occupiedColumns.length === 1) return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
  if (input.columnIndex === occupiedColumns[0]) return 90
  if (input.columnIndex === occupiedColumns[occupiedColumns.length - 1]) return -90
  return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
}

const acrossBoard = (facing: LifeCardContentRotation) => facing === 0 || facing === 180

// why: one copy per seat direction stacked three or four chips around the menu button, so the board keeps a single axis: the one more seats face along, or on a tie the one that runs along the board's longer side, where a chip has room.
export function getPlayerGridFacings(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): LifeCardContentRotation[] {
  const facings = getPlayerGridRows(playerCount, layout).flatMap((row, rowIndex) =>
    row.flatMap((slot, columnIndex) =>
      slot === null
        ? []
        : [getPlayerContentRotation({ playerCount, layout, row, rowIndex, columnIndex, slot })],
    ),
  )
  const across = facings.filter(acrossBoard).length
  const along = facings.length - across
  // why: in the open Duo's center column the menu sits beside the end seats, so the chips face them rather than the side seats that outnumber them.
  const keepAcross = layout.centerColumn
    ? false
    : across === along
      ? layout.landscape
      : across > along
  return [...new Set(facings.filter((facing) => acrossBoard(facing) === keepAcross))]
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
  // why: a book-style fold crosses the middle of the board's long side, so an even count of cells along that side keeps them off the crease.
  spansHinge?: boolean
  holderAngle?: number
}) {
  const landscape = input.width > input.height
  const tablet = Math.min(input.width, input.height) >= 600
  const largeText = (input.fontScale ?? 1) >= 1.4
  const denseColumnCount = input.spansHinge ? (landscape ? 2 : 3) : landscape ? 3 : 2
  const automaticColumnCount =
    input.playerCount === 2
      ? landscape
        ? 2
        : 1
      : input.playerCount === 3 && landscape
        ? 3
        : input.playerCount >= 5
          ? denseColumnCount
          : 2
  const variant = playerGridLayoutForCount(input.playerCount, input.layoutVariant)
  // why: opening the iPhone Duo keeps each player at the edge they faced while it was closed, which leaves the Table's end seats on its long sides; they share a center column until the players turn the device.
  const centerColumn =
    input.spansHinge && variant === "tabletop" && input.playerCount === 6
      ? input.holderAngle === -90
        ? ("panel-top-right" as const)
        : input.holderAngle === 90
          ? ("panel-top-left" as const)
          : undefined
      : undefined
  const columnCount =
    variant === "featured-first" ||
    variant === "featured-last" ||
    variant === "even-grid" ||
    variant === "tabletop"
      ? 2
      : automaticColumnCount
  const rowCount = centerColumn
    ? CENTER_COLUMN_SLOTS_WITH_PANEL_TOP_RIGHT.length
    : variant === "tabletop"
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
    centerColumn,
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
