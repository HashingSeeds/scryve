import { boardPointToWindowPoint, nearestEquivalentAngle } from "./pinnedBoardGeometry"

const board = { width: 400, height: 800 }

describe("boardPointToWindowPoint", () => {
  it("keeps points in place while the holder is upright", () => {
    expect(boardPointToWindowPoint({ x: 0.25, y: 0.125 }, board, 0)).toEqual({ x: 0.25, y: 0.125 })
  })

  it("puts the board's top edge on the window's left when content turns clockwise", () => {
    expect(boardPointToWindowPoint({ x: 0.5, y: 0 }, board, 90)).toEqual({ x: 0, y: 0.5 })
    expect(boardPointToWindowPoint({ x: 1, y: 0 }, board, 90)).toEqual({ x: 0, y: 0 })
  })

  it("puts the board's top edge on the window's right when content turns counterclockwise", () => {
    expect(boardPointToWindowPoint({ x: 0.5, y: 0 }, board, -90)).toEqual({ x: 1, y: 0.5 })
    expect(boardPointToWindowPoint({ x: 0, y: 0 }, board, -90)).toEqual({ x: 1, y: 0 })
  })

  it("mirrors both axes upside down", () => {
    expect(boardPointToWindowPoint({ x: 0.25, y: 0.125 }, board, 180)).toEqual({
      x: 0.75,
      y: 0.875,
    })
  })

  it("keeps the center fixed", () => {
    expect(boardPointToWindowPoint({ x: 0.5, y: 0.5 }, board, 90)).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe("nearestEquivalentAngle", () => {
  it("takes the short way across the wrap", () => {
    expect(nearestEquivalentAngle(170, -170)).toBe(190)
    expect(nearestEquivalentAngle(-90, 0)).toBe(0)
    expect(nearestEquivalentAngle(350, 0)).toBe(360)
  })
})
