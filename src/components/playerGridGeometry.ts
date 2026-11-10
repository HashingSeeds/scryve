import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"

import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardCorner,
  LifeCardEdge,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"

export const FIRST_PLAYER_TAB = { length: 52, depth: 40 } as const

export const CONTENT_EDGES: Record<LifeCardContentRotation, Record<LifeCardEdge, LifeCardEdge>> = {
  0: { top: "top", right: "right", bottom: "bottom", left: "left" },
  90: { top: "right", right: "bottom", bottom: "left", left: "top" },
  [-90]: { top: "left", right: "top", bottom: "right", left: "bottom" },
  180: { top: "bottom", right: "left", bottom: "top", left: "right" },
}

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
  slot: number
}): LifeCardContentRotation {
  if (input.playerCount === 2 && input.layout.layout === "two-stacked")
    return input.slot === 0 ? 180 : 0

  // why: an even grid's last odd seat keeps its column's side, so it faces the same way as the seats above it.
  if (input.row.length === 1) return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
  const occupiedColumns = input.row.flatMap((seat, column) => (seat === null ? [] : [column]))
  if (input.columnIndex === occupiedColumns[0]) return 90
  if (input.columnIndex === occupiedColumns[occupiedColumns.length - 1]) return -90
  return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
}

const acrossBoard = (facing: LifeCardContentRotation) => facing === 0 || facing === 180

// why: one chip copy per seat direction crowded the menu button, so use a single axis: the one more seats face, or the board's longer side on a tie.
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
  const keepAcross = across === along ? layout.landscape : across > along
  return [...new Set(facings.filter((facing) => acrossBoard(facing) === keepAcross))]
}

export interface SeamNeighbor {
  slot: number
  leftFraction: number
  rightFraction: number
}

export type SeamSide = { upper?: SeamNeighbor; lower?: SeamNeighbor }

export function getMenuSeamNeighbors(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): { left: SeamSide; right: SeamSide } {
  const rows = getPlayerGridRows(playerCount, layout)
  const junction = getFourCardMenuJunction(rows)
  const boundary = junction?.boundary ?? getCentralMenuBoundary(rows, layout)
  const anchorX = getPlayerGridMenuAnchor(playerCount, layout).x
  const neighbor = (row: (number | null)[] | undefined, side: "left" | "right") => {
    if (!row) return undefined
    const column =
      side === "left" ? Math.ceil(anchorX * row.length) - 1 : Math.floor(anchorX * row.length)
    const slot = row[Math.min(Math.max(column, 0), row.length - 1)]
    if (slot === null || slot === undefined) return undefined
    const index = row.indexOf(slot)
    return { slot, leftFraction: index / row.length, rightFraction: (index + 1) / row.length }
  }
  const sideOf = (side: "left" | "right"): SeamSide => ({
    upper: neighbor(rows[boundary - 1], side),
    lower: neighbor(rows[boundary], side),
  })
  return { left: sideOf("left"), right: sideOf("right") }
}

export function getPlayerSlotFacings(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): LifeCardContentRotation[] {
  const facings: LifeCardContentRotation[] = []
  getPlayerGridRows(playerCount, layout).forEach((row, rowIndex) =>
    row.forEach((slot, columnIndex) => {
      if (slot !== null)
        facings[slot] = getPlayerContentRotation({
          playerCount,
          layout,
          row,
          rowIndex,
          columnIndex,
          slot,
        })
    }),
  )
  return facings
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

type PlayerGridLayout = ReturnType<typeof getPlayerGridLayout>

export type SeatFrame = ReturnType<typeof seatFrames>["rows"][number][number]

/** why: the safe area reports the screen's own edges, so a board turned a quarter takes each inset from the edge that now sits on that side. */
export function boardInsetsFor(
  screenInsets: Record<LifeCardEdge, number>,
  boardRotation: number,
): Record<LifeCardEdge, number> {
  const { top, right, bottom, left } = screenInsets
  if (boardRotation === 90) return { top: right, right: bottom, bottom: left, left: top }
  if (boardRotation === -90) return { top: left, right: top, bottom: right, left: bottom }
  return screenInsets
}

export function seatFrames(input: {
  playerCount: number
  layout: PlayerGridLayout
  boardSize: { width: number; height: number }
  measuredGrid: { width: number; height: number }
  topEdgeBand: number
  gap: number
  insets: Record<LifeCardEdge, number>
  tabsShown: boolean
}) {
  const { playerCount, layout, measuredGrid: board, gap } = input
  const cutout = getCornerCutout(input.insets, input.boardSize)
  const insets = cutout ? { ...input.insets, [cutout.edge]: 0 } : input.insets
  const rows = getPlayerGridRows(playerCount, layout)
  const rowFlexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const totalFlex = rowFlexes.reduce((sum, flex) => sum + flex, 0)
  const rowSpace = Math.max(board.height - input.topEdgeBand - gap * (rows.length - 1), 0)
  const menuJunction = getFourCardMenuJunction(rows)
  const fallbackMenuBoundary = menuJunction ? null : getCentralMenuBoundary(rows, layout)
  const tabRow = input.tabsShown ? (menuJunction?.boundary ?? fallbackMenuBoundary) : null
  const rowHeights = rowFlexes.map((flex) => (rowSpace * flex) / totalFlex)
  return {
    insets,
    cutout,
    rows: rows.map((row, rowIndex) =>
      row.map((slot, columnIndex) => {
        if (slot === null) return null
        const width = Math.max((board.width - gap * (row.length - 1)) / row.length, 0)
        const rotation = getPlayerContentRotation({
          playerCount,
          layout,
          row,
          rowIndex,
          columnIndex,
          slot,
        })
        const screenEdges = {
          top: rowIndex === 0,
          bottom: rowIndex === rows.length - 1,
          left: columnIndex === 0,
          right: columnIndex === row.length - 1,
        }
        const fallbackMenu =
          fallbackMenuBoundary === null
            ? undefined
            : fallbackMenuAt(rows, fallbackMenuBoundary, rowIndex, columnIndex)
        return {
          slot,
          rowIndex,
          columnIndex,
          rotation,
          card: {
            x: columnIndex * (width + gap),
            y:
              input.topEdgeBand +
              rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height + gap, 0),
            width,
            height: rowHeights[rowIndex],
          },
          screenEdges,
          contentInsets: {
            top: screenEdges.top ? insets.top : 0,
            bottom: screenEdges.bottom ? insets.bottom : 0,
            left: screenEdges.left ? insets.left : 0,
            right: screenEdges.right ? insets.right : 0,
            cutout: seatCutout(cutout, rotation, screenEdges),
            tabCorners: seatTabCorners(tabRow, rowIndex, rotation, screenEdges),
          } satisfies LifeCardContentInsets,
          menuCorner: menuCornerAt(menuJunction, rowIndex, columnIndex) ?? fallbackMenu?.corner,
          menuEdgeCenter: fallbackMenu?.edgeCenter,
        }
      }),
    ),
  }
}

/** why: the iPhone Duo outer display reports its top-corner camera hole as safe area down that side, the only upright screen with a side inset. Seats keep full width; only that corner's chrome moves. */
export function getCornerCutout(
  insets: Record<LifeCardEdge, number>,
  board: { width: number; height: number },
) {
  if (board.height <= board.width) return undefined
  const edge =
    insets.right > insets.top
      ? ("right" as const)
      : insets.left > insets.top
        ? ("left" as const)
        : undefined
  return edge && { edge, size: insets[edge] }
}

export function seatCutout(
  cutout: ReturnType<typeof getCornerCutout>,
  rotation: LifeCardContentRotation,
  screenEdges: Record<LifeCardEdge, boolean>,
): LifeCardContentInsets["cutout"] {
  if (!cutout || !screenEdges.top || !screenEdges[cutout.edge]) return undefined
  // why: corner chrome slides along its own row, so it stays against the seat's outer edge.
  const facesCutoutSide = rotation === (cutout.edge === "right" ? -90 : 90)
  return facesCutoutSide
    ? { edge: "top", side: cutout.edge, size: cutout.size }
    : { edge: cutout.edge, side: "top", size: cutout.size }
}

/** why: the first-player tabs straddle the menu's row at the board's side edges. Corner chrome beside one steps along its row: past half the tab up a side edge, or past its depth along the seam. */
function seatTabCorners(
  tabRow: number | null,
  rowIndex: number,
  rotation: LifeCardContentRotation,
  screenEdges: Record<LifeCardEdge, boolean>,
): LifeCardCorner[] | undefined {
  if (tabRow === null) return undefined
  const seam = rowIndex === tabRow ? "top" : rowIndex === tabRow - 1 ? "bottom" : null
  if (!seam) return undefined
  const rowEdge = CONTENT_EDGES[rotation].bottom
  return (["left", "right"] as const)
    .filter((side) => screenEdges[side])
    .flatMap((side): LifeCardCorner[] =>
      rowEdge === seam
        ? [{ edge: side, side: seam, size: FIRST_PLAYER_TAB.depth }]
        : rowEdge === side
          ? [{ edge: seam, side, size: FIRST_PLAYER_TAB.length / 2 }]
          : [],
    )
}

function menuCornerAt(
  junction: ReturnType<typeof getFourCardMenuJunction>,
  row: number,
  column: number,
): LifeCardMenuCorner | undefined {
  if (!junction) return undefined
  if (row === junction.boundary - 1 && column === junction.column - 1) return "bottomRight"
  if (row === junction.boundary - 1 && column === junction.column) return "bottomLeft"
  if (row === junction.boundary && column === junction.column - 1) return "topRight"
  if (row === junction.boundary && column === junction.column) return "topLeft"
  return undefined
}

function fallbackMenuAt(
  rows: (number | null)[][],
  boundary: number,
  row: number,
  column: number,
): { corner?: LifeCardMenuCorner; edgeCenter?: LifeCardMenuEdge } | undefined {
  if (rows.length === 1 && rows[0].length === 2)
    return row === 0 ? { edgeCenter: column === 0 ? "right" : "left" } : undefined
  if (rows.length === 1) return undefined
  if (row !== boundary - 1 && row !== boundary) return undefined
  const upper = row === boundary - 1
  const count = rows[row].length
  const middle = Math.floor(count / 2)
  if (count % 2) return column === middle ? { edgeCenter: upper ? "bottom" : "top" } : undefined
  if (column === middle - 1) return { corner: upper ? "bottomRight" : "topRight" }
  if (column === middle) return { corner: upper ? "bottomLeft" : "topLeft" }
  return undefined
}
