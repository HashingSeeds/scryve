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
  if (layout.kept) return layout.kept.rows
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
  if (input.layout.kept) return input.layout.kept.facings[input.slot]
  if (input.playerCount === 2 && input.layout.layout === "two-stacked")
    return input.slot === 0 ? 180 : 0

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
  // why: on an open Duo's kept board the menu sits between the seats facing its long sides, so the chips face them rather than the side seats that may outnumber them.
  const keepAcross = layout.kept?.middle
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
  const kept =
    input.spansHinge && Math.abs(input.holderAngle ?? 0) === 90
      ? keptSeats({ ...input, holderAngle: input.holderAngle ?? 0 })
      : undefined
  const columnCount = kept
    ? Math.max(...kept.rows.map((row) => row.length))
    : variant === "featured-first" ||
        variant === "featured-last" ||
        variant === "even-grid" ||
        variant === "tabletop"
      ? 2
      : automaticColumnCount
  const rowCount = kept
    ? kept.rows.length
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
    kept,
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

/** why: opening an iPhone Duo leaves every player at the edge they sat at while it was closed, so the open board keeps each seat facing that edge: seats facing the left and right edges stack in side columns, and seats facing the long edges share the middle, until the players turn the device for the upright layout. `rows` and `facings` are on the panel, which the holder sees turned by `holderAngle`. */
function keptSeats(input: {
  playerCount: number
  width: number
  height: number
  fontScale?: number
  layoutVariant?: PlayerGridLayoutVariant
  holderAngle: number
}) {
  const outer = {
    width: Math.max(input.width, input.height) / 2,
    height: Math.min(input.width, input.height),
  }
  const closed = getPlayerGridLayout({
    ...input,
    ...outer,
    spansHinge: false,
    holderAngle: undefined,
  })
  const facing = new Map<number, LifeCardContentRotation>()
  getPlayerGridRows(input.playerCount, closed).forEach((row, rowIndex) =>
    row.forEach((slot, columnIndex) => {
      if (slot !== null)
        facing.set(
          slot,
          getPlayerContentRotation({
            playerCount: input.playerCount,
            layout: closed,
            row,
            rowIndex,
            columnIndex,
            slot,
          }),
        )
    }),
  )
  const facingEdge = (edge: LifeCardContentRotation) =>
    [...facing].filter(([, toward]) => toward === edge).map(([slot]) => slot)
  const middle = [...facingEdge(180), ...facingEdge(0)]
  const holderColumns = [facingEdge(90), middle, facingEdge(-90)].filter((column) => column.length)
  // why: with the holder at -90 the panel's top is the holder's right, so the holder's columns read right to left down the panel and each column's top lands on the panel's left.
  const panelTopRight = [...holderColumns].reverse()
  const rows =
    input.holderAngle === -90
      ? panelTopRight
      : panelTopRight.map((row) => [...row].reverse()).reverse()
  const onPanel = (toward: LifeCardContentRotation) => {
    const turned = (((toward + input.holderAngle) % 360) + 360) % 360
    return (turned > 180 ? turned - 360 : turned) as LifeCardContentRotation
  }
  return {
    rows,
    facings: Object.fromEntries([...facing].map(([slot, toward]) => [slot, onPanel(toward)])),
    middle: middle.length > 0,
    // why: seats only on the long edges already read upright on the open Duo, so only a board with seats facing its short edges gains from turning.
    offersTurn: holderColumns.length > (middle.length ? 1 : 0),
  }
}
