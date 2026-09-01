import { asPlayerId } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"

import { commanderBoardGrid, commanderBoardSeats } from "./commanderDamageLayout"
import type { LifeCardContentRotation } from "./playerCardTypes"

const ROTATIONS: LifeCardContentRotation[] = [0, 90, -90, 180]

function screenPositionAfterRotation(
  cell: { row: number; column: number },
  grid: { rows: number; columns: number },
  rotation: LifeCardContentRotation,
): { row: number; column: number } {
  if (rotation === 90) return { row: cell.column, column: grid.rows - 1 - cell.row }
  if (rotation === -90) return { row: grid.columns - 1 - cell.column, column: cell.row }
  if (rotation === 180)
    return { row: grid.rows - 1 - cell.row, column: grid.columns - 1 - cell.column }
  return { row: cell.row, column: cell.column }
}

const playerIds = (count: number): PlayerId[] =>
  Array.from({ length: count }, (_, index) => asPlayerId(`player-${index}`))

const GRIDS: Record<number, (number | null)[][]> = {
  2: [[0], [1]],
  3: [[0], [1, 2]],
  4: [
    [0, 1],
    [2, 3],
  ],
  5: [[0, 1], [2, 3], [4]],
  6: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
}

describe("commander damage board layout", () => {
  it.each([2, 3, 4, 5, 6])(
    "puts every cell on its player's screen position at %i players",
    (count) => {
      const ids = playerIds(count)
      const { seats, rows, columns } = commanderBoardSeats(GRIDS[count], ids)
      expect(seats).toHaveLength(count)

      for (const rotation of ROTATIONS) {
        const grid = commanderBoardGrid({ seats, rows, columns, rotation })
        const placed = new Map<PlayerId, { row: number; column: number }>()
        grid.cells.forEach((cellRow, row) => {
          cellRow.forEach((playerId, column) => {
            if (playerId)
              placed.set(playerId, screenPositionAfterRotation({ row, column }, grid, rotation))
          })
        })
        expect(placed.size).toBe(count)
        for (const seat of seats) {
          expect({ rotation, ...placed.get(seat.playerId) }).toEqual({
            rotation,
            row: seat.row,
            column: seat.column,
          })
        }
      }
    },
  )

  it("swaps the grid's own rows and columns on a quarter turn", () => {
    const ids = playerIds(6)
    const { seats, rows, columns } = commanderBoardSeats(GRIDS[6], ids)
    expect({ rows, columns }).toEqual({ rows: 3, columns: 2 })
    for (const rotation of [90, -90] as const) {
      const grid = commanderBoardGrid({ seats, rows, columns, rotation })
      expect({ rows: grid.rows, columns: grid.columns }).toEqual({ rows: 2, columns: 3 })
    }
    for (const rotation of [0, 180] as const) {
      const grid = commanderBoardGrid({ seats, rows, columns, rotation })
      expect({ rows: grid.rows, columns: grid.columns }).toEqual({ rows: 3, columns: 2 })
    }
  })

  it("puts a top-row owner's sword on the far side of their own board", () => {
    const ids = playerIds(4)
    const { seats, rows, columns } = commanderBoardSeats(GRIDS[4], ids)
    const grid = commanderBoardGrid({ seats, rows, columns, rotation: 90 })
    expect(grid.cells[1][0]).toBe(ids[0])
    expect(grid.cells[0][0]).toBe(ids[1])
  })

  it("leaves ragged rows as empty cells rather than shifting neighbours", () => {
    const ids = playerIds(3)
    const { seats, rows, columns } = commanderBoardSeats(GRIDS[3], ids)
    const grid = commanderBoardGrid({ seats, rows, columns, rotation: 0 })
    expect(grid.cells).toEqual([
      [ids[0], null],
      [ids[1], ids[2]],
    ])
  })
})
