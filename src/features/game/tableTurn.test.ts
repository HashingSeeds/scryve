import { getPlayerGridCellRects, getPlayerGridLayout } from "@/components/playerGridGeometry"

import {
  hingeUnfold,
  rotateRectAround,
  tableTurnGather,
  tableTurnLanding,
  tableTurnPlacement,
  windowRectToPanel,
} from "./tableTurn"

const board = { width: 669, height: 951 }
const center = { x: board.width / 2, y: board.height / 2 }
const centerOf = (rect: { x: number; y: number; width: number; height: number }) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
})

describe("table turn", () => {
  it("gathers the seats by 45 degrees either way and spreads them again on the way back", () => {
    expect(tableTurnGather(0)).toBe(0)
    expect(tableTurnGather(22.5)).toBeCloseTo(0.5)
    expect(tableTurnGather(-45)).toBe(1)
    expect(tableTurnGather(80)).toBe(1)
  })

  it.each([
    [-90, 90, "upright"],
    [-90, -90, "reversed"],
    [90, -90, "upright"],
    [90, 90, "reversed"],
  ] as const)(
    "with the panel held at %i, a %i degree turn lands on the %s Table board",
    (holderAngle, angle, landing) => {
      expect(tableTurnLanding(angle, holderAngle)).toBe(landing)
    },
  )

  it("turns a rect a quarter about a point, swapping its sides", () => {
    expect(rotateRectAround({ x: 0, y: 0, width: 100, height: 20 }, { x: 50, y: 50 }, 1)).toEqual({
      x: 80,
      y: 0,
      width: 20,
      height: 100,
    })
  })

  it("starts each seat in its center column cell and lands it on its panel Table cell", () => {
    const layout = getPlayerGridLayout({
      playerCount: 6,
      ...board,
      layoutVariant: "tabletop",
      spansHinge: true,
    })
    const panelTable = getPlayerGridCellRects({ playerCount: 6, layout, board, gap: 4 })
    const cell = { x: 0, y: 634, width: 332, height: 317 }
    const table = rotateRectAround(panelTable.get(0)!, center, -1)

    expect(tableTurnPlacement({ cell, table, board, angle: 0 })).toEqual({
      centerX: centerOf(cell).x,
      centerY: centerOf(cell).y,
      width: cell.width,
      height: cell.height,
      angle: 0,
      scale: 1,
    })
    const landed = tableTurnPlacement({ cell, table, board, angle: 90 })
    expect(landed.centerX).toBeCloseTo(centerOf(panelTable.get(0)!).x)
    expect(landed.centerY).toBeCloseTo(centerOf(panelTable.get(0)!).y)
    expect(landed).toMatchObject({ width: table.width, height: table.height, angle: 90, scale: 1 })
  })

  it("keeps a seat's layout fixed once the seats have gathered, growing it by scale", () => {
    const cell = { x: 0, y: 0, width: 332, height: 317 }
    const table = { x: 100, y: 200, width: 150, height: 300 }
    const sizes = [50, 70].map((angle) => tableTurnPlacement({ cell, table, board, angle }))

    expect(sizes[0]).toMatchObject({ width: table.width, height: table.height })
    expect(sizes[1]).toMatchObject({ width: table.width, height: table.height })
    expect(sizes[1].scale).toBeGreaterThan(sizes[0].scale)
  })

  it("spreads the seats as the hinge opens past the switch to the inner display", () => {
    expect(hingeUnfold({ status: "partiallyOpen", angle: 25 })).toBe(0)
    expect(hingeUnfold({ status: "partiallyOpen", angle: 95 })).toBeCloseTo(0.5)
    expect(hingeUnfold({ status: "partiallyOpen", angle: 170 })).toBe(1)
    expect(hingeUnfold({ status: "fullyOpen", angle: 120 })).toBe(1)
    expect(hingeUnfold(null)).toBe(1)
  })

  it("puts the window's right half on the panel's top half when the panel's top is on the holder's right", () => {
    const rightHalf = { x: 475.5, y: 0, width: 475.5, height: 669 }

    expect(windowRectToPanel(rightHalf, board, -90)).toEqual({
      x: 0,
      y: 0,
      width: 669,
      height: 475.5,
    })
  })
})
