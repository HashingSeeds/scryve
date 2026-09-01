import type { PlayerId } from "@/features/game/types"

import type { LifeCardContentRotation } from "./playerCardTypes"

export interface CommanderBoardSeat {
  playerId: PlayerId
  row: number
  column: number
}

export interface CommanderBoardGrid {
  rows: number
  columns: number
  cells: (PlayerId | null)[][]
}

export function commanderBoardSeats(
  gridRows: readonly (number | null)[][],
  playerIds: readonly PlayerId[],
): { seats: CommanderBoardSeat[]; rows: number; columns: number } {
  const seats: CommanderBoardSeat[] = []
  let columns = 0
  gridRows.forEach((gridRow, row) => {
    columns = Math.max(columns, gridRow.length)
    gridRow.forEach((playerIndex, column) => {
      if (playerIndex === null) return
      const playerId = playerIds[playerIndex]
      if (playerId === undefined) return
      seats.push({ playerId, row, column })
    })
  })
  return { seats, rows: Math.max(gridRows.length, 1), columns: Math.max(columns, 1) }
}

function rotateSeat(
  seat: CommanderBoardSeat,
  rows: number,
  columns: number,
  rotation: LifeCardContentRotation,
): { row: number; column: number } {
  if (rotation === 90) return { row: columns - 1 - seat.column, column: seat.row }
  if (rotation === -90) return { row: seat.column, column: rows - 1 - seat.row }
  if (rotation === 180) return { row: rows - 1 - seat.row, column: columns - 1 - seat.column }
  return { row: seat.row, column: seat.column }
}

export function commanderBoardGrid(input: {
  seats: readonly CommanderBoardSeat[]
  rows: number
  columns: number
  rotation: LifeCardContentRotation
}): CommanderBoardGrid {
  const quarterTurn = input.rotation === 90 || input.rotation === -90
  const rows = quarterTurn ? input.columns : input.rows
  const columns = quarterTurn ? input.rows : input.columns
  const cells: (PlayerId | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => null),
  )
  for (const seat of input.seats) {
    const placed = rotateSeat(seat, input.rows, input.columns, input.rotation)
    cells[placed.row][placed.column] = seat.playerId
  }
  return { rows, columns, cells }
}

export const COMMANDER_CELL_SIZE = 30
export const COMMANDER_COMPACT_CELL_SIZE = 24
// Below this the tabular digits stop being readable, so a cramped card scrolls
// its board out of the reserved space rather than shrinking past legibility.
export const COMMANDER_MIN_CELL_SIZE = 14

/**
 * Shrinks the square cell so the whole grid fits the space the card reserved for
 * it. `maxSize` is measured on the board's own axes, which the card has already
 * mapped through the content rotation.
 */
export function commanderCellSize(input: {
  rows: number
  columns: number
  gap: number
  preferred: number
  maxSize?: { width: number; height: number }
}): number {
  const { rows, columns, gap, preferred, maxSize } = input
  if (!maxSize) return preferred
  const fitsWidth = (maxSize.width - gap * Math.max(columns - 1, 0)) / Math.max(columns, 1)
  const fitsHeight = (maxSize.height - gap * Math.max(rows - 1, 0)) / Math.max(rows, 1)
  const fitted = Math.floor(Math.min(preferred, fitsWidth, fitsHeight))
  return Math.max(COMMANDER_MIN_CELL_SIZE, fitted)
}
