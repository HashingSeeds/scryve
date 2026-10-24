import { asPlayerId } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"

import { commanderBoardGrid, commanderBoardSeats, commanderFacing } from "./commanderDamageLayout"

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
  it.each([2, 3, 4, 5, 6])("mirrors the player grid's own seating at %i players", (count) => {
    const ids = playerIds(count)
    const { seats, rows, columns } = commanderBoardSeats(GRIDS[count], ids)
    expect(seats).toHaveLength(count)

    const grid = commanderBoardGrid({ seats, rows, columns })
    expect({ rows: grid.rows, columns: grid.columns }).toEqual({ rows, columns })
    for (const seat of seats) expect(grid.cells[seat.row][seat.column]).toBe(seat.playerId)
  })

  it("leaves ragged rows as empty cells rather than shifting neighbours", () => {
    const ids = playerIds(3)
    const { seats, rows, columns } = commanderBoardSeats(GRIDS[3], ids)
    const grid = commanderBoardGrid({ seats, rows, columns })
    expect(grid.cells).toEqual([
      [ids[0], null],
      [ids[1], ids[2]],
    ])
  })

  it("faces a neighbour's shared edge and only the corner of the seat across", () => {
    expect(commanderFacing(GRIDS[4], 0, 1)).toEqual({ x: "left" })
    expect(commanderFacing(GRIDS[4], 0, 2)).toEqual({ y: "top" })
    expect(commanderFacing(GRIDS[4], 0, 3)).toEqual({ x: "left", y: "top" })
    expect(commanderFacing(GRIDS[4], 3, 0)).toEqual({ x: "right", y: "bottom" })
  })

  it("treats a full-width seat as sharing a column with every seat below it", () => {
    expect(commanderFacing(GRIDS[3], 0, 1)).toEqual({ y: "top" })
    expect(commanderFacing(GRIDS[3], 2, 0)).toEqual({ y: "bottom" })
    expect(commanderFacing(GRIDS[6], 0, 5)).toEqual({ x: "left", y: "top" })
  })
})
