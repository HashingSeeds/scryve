import { asPlayerId } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"

import {
  commanderBoardGrid,
  commanderBoardSeats,
  commanderFacing,
  commanderReach,
  commanderTakeover,
  lifeInk,
  outInk,
} from "./commanderDamageLayout"

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

  it("grows the attacker's card until it covers the farthest seat", () => {
    const reach = (defenderIndex: number) =>
      commanderReach({
        gridRows: GRIDS[5],
        rowFlexes: [1, 1, 0.8],
        board: { width: 400, height: 840 },
        attackerIndex: 0,
        defenderIndex,
      })
    // why: the attacker's card spans 0 to 200 across and 0 to 300 down; the bottom seat spans the board's width from 600 to 840, so the card must grow 540 to reach its bottom edge.
    const bottom = reach(4)
    expect(bottom?.x).toBeCloseTo(-100)
    expect(bottom?.y).toBeCloseTo(-570)
    expect(bottom?.card.width).toBeCloseTo(200)
    expect(bottom?.card.height).toBeCloseTo(300)
    expect(bottom?.distance).toBeCloseTo(540)
    expect(reach(1)?.distance).toBeCloseTo(540)
  })

  it("starts the damage arc toward the attacker and knocks the card away", () => {
    const takeover = commanderTakeover({
      card: { width: 390, height: 420 },
      rotation: 0,
      lifeFontSize: 148,
      ink: lifeInk(148, 2),
      reach: { x: 0, y: -424, card: { width: 390, height: 420 }, distance: 900 },
    })
    expect(takeover.angle).toBeCloseTo(-Math.PI / 2)
    expect(takeover.knock.x).toBeCloseTo(0)
    expect(takeover.knock.y).toBeCloseTo(1)
    expect(takeover.flood).toEqual({
      x: 195,
      y: -214,
      card: { width: 390, height: 420 },
      distance: 900,
      discGap: expect.any(Number),
    })
  })

  it("reads the attacker's direction in a sideways seat's own orientation", () => {
    const takeover = commanderTakeover({
      card: { width: 193, height: 420 },
      rotation: 90,
      lifeFontSize: 104,
      ink: lifeInk(104, 2),
      reach: { x: 0, y: -424, card: { width: 390, height: 420 }, distance: 900 },
    })
    expect(Math.cos(takeover.angle)).toBeCloseTo(-1)
    expect(takeover.knock.x).toBeCloseTo(0)
    expect(takeover.knock.y).toBeCloseTo(1)
  })

  it("shrinks a readout too big for its card into the disc", () => {
    const ink = outInk({
      fontSize: 100,
      digits: 2,
      lead: 56,
      below: { fontSize: 22, lineHeight: 28, chars: 2 },
    })
    const { disc, fit } = commanderTakeover({
      card: { width: 390, height: 230 },
      rotation: 0,
      lifeFontSize: 100,
      ink,
    })
    expect(fit).toBeLessThan(1)
    expect(Math.hypot(ink.width * fit, ink.height * fit) / 2).toBeLessThan(disc)
    expect(disc).toBeLessThanOrEqual(115)
  })

  it("rings two digits with room past their ink, centred where the digits sit", () => {
    const fontSize = 100
    const { disc, discOffset, cardDiscOffset } = commanderTakeover({
      card: { width: 420, height: 390 },
      rotation: 90,
      lifeFontSize: fontSize,
      ink: lifeInk(fontSize, 2),
    })
    const ink = Math.hypot(2 * 0.64 * fontSize, 0.72 * fontSize) / 2
    expect(disc - ink).toBeCloseTo(0.08 * fontSize)
    expect(discOffset.y).toBeLessThan(0)
    expect(cardDiscOffset.x).toBeCloseTo(-discOffset.y)
    expect(cardDiscOffset.y).toBeCloseTo(0)
  })
})
