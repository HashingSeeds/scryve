import { asPlayerId } from "@/features/game/domain"
import type { PlayerId } from "@/features/game/types"

import {
  commanderBoardGrid,
  commanderBoardSeats,
  commanderFacing,
  commanderReach,
  commanderTakeover,
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

  it("measures the attacker from each seat so one wave can cross the whole board", () => {
    const reach = commanderReach({
      gridRows: GRIDS[5],
      rowFlexes: [1, 1, 0.8],
      board: { width: 400, height: 840 },
      attackerIndex: 0,
      defenderIndex: 4,
    })
    expect(reach).toEqual({ x: -100, y: -570, radius: Math.hypot(300, 690) })
  })

  it("parks the badge just outside the life disc, toward the attacker, and knocks the card away", () => {
    const takeover = commanderTakeover({
      card: { width: 390, height: 420 },
      rotation: 0,
      lifeFontSize: 148,
      lifeDigits: 2,
      badgeSize: 46,
      reach: { x: 0, y: -424, radius: 900 },
    })
    expect(takeover.badges[0].x).toBeCloseTo(0)
    expect(takeover.badges[0].y).toBeCloseTo(takeover.discOffset.y - (takeover.disc + 23 + 6))
    expect(takeover.knock.x).toBeCloseTo(0)
    expect(takeover.knock.y).toBeCloseTo(1)
    expect(takeover.flood).toEqual({ x: 195, y: -214, radius: 900 })
  })

  it("reads the attacker's direction in a sideways seat's own orientation", () => {
    const takeover = commanderTakeover({
      card: { width: 193, height: 420 },
      rotation: 90,
      lifeFontSize: 104,
      lifeDigits: 2,
      badgeSize: 46,
      reach: { x: 0, y: -424, radius: 900 },
    })
    expect(takeover.badges[0].x).toBeCloseTo(-takeover.badges[0].distance)
    expect(takeover.knock.x).toBeCloseTo(0)
    expect(takeover.knock.y).toBeCloseTo(1)
  })

  it("slides the badge around the disc when the attacker sits across a narrow card", () => {
    const {
      badges: [badge],
      discOffset,
      knock,
    } = commanderTakeover({
      card: { width: 193, height: 420 },
      rotation: -90,
      lifeFontSize: 104,
      lifeDigits: 2,
      badgeSize: 46,
      reach: { x: -197, y: 0, radius: 900 },
    })
    expect(Math.abs(badge.x) + badge.size / 2).toBeLessThanOrEqual(210)
    expect(Math.abs(badge.y) + badge.size / 2).toBeLessThanOrEqual(96.5)
    const outward = { x: Math.cos(badge.angle), y: Math.sin(badge.angle) }
    expect(Math.hypot(badge.x - discOffset.x, badge.y - discOffset.y)).toBeCloseTo(badge.distance)
    expect(outward.y).toBeLessThan(0)
    expect(Math.hypot(knock.x, knock.y)).toBeCloseTo(1)
  })

  it("rings two digits with room past their ink, centred where the digits sit", () => {
    const fontSize = 100
    const { disc, discOffset, cardDiscOffset } = commanderTakeover({
      card: { width: 420, height: 390 },
      rotation: 90,
      lifeFontSize: fontSize,
      lifeDigits: 2,
      badgeSize: 46,
    })
    const ink = Math.hypot(2 * 0.64 * fontSize, 0.72 * fontSize) / 2
    expect(disc - ink).toBeCloseTo(0.08 * fontSize)
    expect(discOffset.y).toBeLessThan(0)
    expect(cardDiscOffset.x).toBeCloseTo(-discOffset.y)
    expect(cardDiscOffset.y).toBeCloseTo(0)
  })

  it("sets a partner's badge beside the first, both outside the ring, on the card, toward the attacker", () => {
    const { badges, discOffset, disc } = commanderTakeover({
      card: { width: 390, height: 420 },
      rotation: 0,
      lifeFontSize: 148,
      lifeDigits: 2,
      badgeSize: 46,
      badgeCount: 2,
      reach: { x: 0, y: -424, radius: 900 },
    })
    expect(badges).toHaveLength(2)
    const [first, partner] = badges
    expect(first.x).toBeCloseTo(-partner.x)
    expect(first.y).toBeCloseTo(partner.y)
    expect(first.y).toBeLessThan(0)
    expect(partner.x - first.x).toBeGreaterThanOrEqual(46)
    for (const badge of badges) {
      expect(
        Math.hypot(badge.x - discOffset.x, badge.y - discOffset.y) - badge.size / 2,
      ).toBeGreaterThan(disc)
      expect(Math.abs(badge.x) + badge.size / 2).toBeLessThanOrEqual(195)
      expect(Math.abs(badge.y) + badge.size / 2).toBeLessThanOrEqual(210)
    }
  })
})
