import { COMPACT_MENU_BUTTON_SIZE, MENU_BUTTON_SIZE } from "@/components/GameRadialMenu"
import {
  getMenuSeamNeighbors,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerSlotFacings,
} from "@/components/playerGridGeometry"

import { chipCrowdedBySeam, ICON_WIDTH, planSeam, seamRoom } from "./seamPlan"

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
})
