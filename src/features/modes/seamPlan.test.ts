import { COMPACT_MENU_BUTTON_SIZE, MENU_BUTTON_SIZE } from "@/components/GameRadialMenu"
import {
  getMenuSeamNeighbors,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerSlotFacings,
} from "@/components/playerGridGeometry"
import { teamGridLayout, teamRivets } from "@/components/teamGridGeometry"

import {
  chipCrowdedBySeam,
  ICON_WIDTH,
  PLATE_HEIGHT,
  planSeam,
  seamRoom,
  type SeamRivet,
} from "./seamPlan"

function geometryFor(playerCount: number, width: number, height: number) {
  const layout = getPlayerGridLayout({ playerCount, width, height })
  return {
    sides: getMenuSeamNeighbors(playerCount, layout),
    facings: getPlayerSlotFacings(playerCount, layout),
    anchorX: getPlayerGridMenuAnchor(playerCount, layout).x,
    width,
    menuSize: playerCount > 2 ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE,
    edge: 8,
  }
}

describe("seamPlan", () => {
  it("fits 5-seat plates between the pentagon and the side seats' + and −", () => {
    const geometry = geometryFor(5, 390, 844)
    const left = seamRoom(geometry, "left", new Set([0]))!
    const right = seamRoom(geometry, "right", new Set([0]))!
    const glyphEdge = 390 / 4 + 25
    expect(left.start - left.width).toBeGreaterThanOrEqual(glyphEdge)
    expect(right.start + right.width).toBeLessThanOrEqual(390 - glyphEdge)
    expect(left.width).toBeGreaterThanOrEqual(ICON_WIDTH)
    expect(planSeam({ left, right }, ["plane", "scheme"])).toMatchObject({
      left: { items: ["plane"] },
      right: { items: ["scheme"] },
    })
  })

  it("drops every plate where no side has room for an icon, which the seat bags cover", () => {
    const geometry = geometryFor(4, 320, 693)
    const rooms = {
      left: seamRoom(geometry, "left", new Set([0])),
      right: seamRoom(geometry, "right", new Set([0])),
    }
    expect([rooms.left?.width ?? 0, rooms.right?.width ?? 0].every((w) => w < ICON_WIDTH)).toBe(
      true,
    )
    expect(planSeam(rooms, ["plane", "die"])).toEqual({})
  })

  it("keeps the side an active across seat's chip slides to, and puts the die in that seat's card", () => {
    const geometry = geometryFor(2, 390, 844)
    const topSeatActive = new Set([0])
    const left = seamRoom(geometry, "left", topSeatActive)!
    const right = seamRoom(geometry, "right", topSeatActive)!
    expect(left).toMatchObject({ inActiveCard: false, rotation: 0 })
    expect(right).toMatchObject({ inActiveCard: true, rotation: 180 })
    expect(chipCrowdedBySeam(geometry, topSeatActive)).toBe(true)
    expect(planSeam({ left, right }, ["plane", "die"])).toMatchObject({
      left: { items: ["plane"] },
      right: { items: ["die"] },
    })
  })

  it("leaves the die on the chip of a side-facing seat", () => {
    expect(chipCrowdedBySeam(geometryFor(4, 390, 844), new Set([0]))).toBe(false)
  })

  it("keeps a due scheme readable on the active archenemy's side when their chip is crowded", () => {
    const geometry = geometryFor(3, 390, 844)
    const archenemyOnTop = new Set([0])
    const rooms = {
      left: seamRoom(geometry, "left", archenemyOnTop),
      right: seamRoom(geometry, "right", archenemyOnTop),
    }
    expect(chipCrowdedBySeam(geometry, archenemyOnTop)).toBe(true)
    expect(planSeam(rooms, ["plane", "die", "schemeDue"])).toMatchObject({
      left: { items: ["plane"] },
      right: { items: ["die", "schemeDue"], room: { inActiveCard: true } },
    })
  })

  it("keeps a Two-Headed Giant plane plate off the teams' link rivets", () => {
    const [width, height] = [402, 874]
    const layout = teamGridLayout({ playerCount: 2, width, height })
    const anchor = getPlayerGridMenuAnchor(2, layout)
    const rivets: SeamRivet[] = teamRivets(2, layout, { width, height }, anchor).map(
      ({ x, y, size }) => ({ x, dy: y - anchor.y * height, size }),
    )
    const geometry = {
      sides: getMenuSeamNeighbors(2, layout),
      facings: getPlayerSlotFacings(2, layout),
      anchorX: anchor.x,
      width,
      menuSize: MENU_BUTTON_SIZE,
      edge: 8,
      rivets,
    }
    const rooms = {
      left: seamRoom(geometry, "left", new Set()),
      right: seamRoom(geometry, "right", new Set()),
    }
    const { room } = planSeam(rooms, ["plane"]).left!
    const plateLeft = room.direction === 1 ? room.start : room.start - ICON_WIDTH
    const onPlate = ({ x, dy, size }: SeamRivet) =>
      x + size / 2 > plateLeft &&
      x - size / 2 < plateLeft + ICON_WIDTH &&
      Math.abs(room.shift - dy) < (PLATE_HEIGHT + size) / 2
    expect(
      rivets.some((rivet) => rivet.dy === 0 && Math.abs(rivet.x - room.start) < ICON_WIDTH),
    ).toBe(true)
    expect(rivets.filter(onPlate)).toEqual([])
  })
})
