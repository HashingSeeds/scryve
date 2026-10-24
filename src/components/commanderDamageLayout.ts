import type { PlayerId } from "@/features/game/types"

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

export function commanderBoardGrid(input: {
  seats: readonly CommanderBoardSeat[]
  rows: number
  columns: number
}): CommanderBoardGrid {
  const cells: (PlayerId | null)[][] = Array.from({ length: input.rows }, () =>
    Array.from({ length: input.columns }, () => null),
  )
  for (const seat of input.seats) cells[seat.row][seat.column] = seat.playerId
  return { rows: input.rows, columns: input.columns, cells }
}

export const COMMANDER_CELL_SIZE = 30
export const COMMANDER_COMPACT_CELL_SIZE = 24
// Below this the tabular digits stop being readable, so a cramped card scrolls
// its board out of the reserved space rather than shrinking past legibility.
export const COMMANDER_MIN_CELL_SIZE = 14

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

export interface CommanderFacing {
  x?: "left" | "right"
  y?: "top" | "bottom"
}

function seatSpan(gridRows: readonly (number | null)[][], playerIndex: number) {
  for (const [row, slots] of gridRows.entries()) {
    const column = slots.indexOf(playerIndex)
    if (column >= 0) return { row, left: column / slots.length, right: (column + 1) / slots.length }
  }
  return undefined
}

export function commanderFacing(
  gridRows: readonly (number | null)[][],
  attackerIndex: number,
  defenderIndex: number,
): CommanderFacing {
  const attacker = seatSpan(gridRows, attackerIndex)
  const defender = seatSpan(gridRows, defenderIndex)
  if (!attacker || !defender || attackerIndex === defenderIndex) return {}
  const x = attacker.left + attacker.right < defender.left + defender.right ? "left" : "right"
  const y = attacker.row < defender.row ? "top" : "bottom"
  if (attacker.row === defender.row) return { x }
  const sharesColumn = attacker.left < defender.right && defender.left < attacker.right
  return sharesColumn ? { y } : { x, y }
}
