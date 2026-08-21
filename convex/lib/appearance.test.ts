import {
  appearanceIsTaken,
  isPlayerMarkShape,
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  resolveAppearance,
  shapeForSeat,
} from "./appearance"

const RED = PLAYER_COLOR_CHOICES[0]
const BLUE = PLAYER_COLOR_CHOICES[1]

describe("player appearance", () => {
  it("keeps seat order as the mark for players who never chose one", () => {
    expect(shapeForSeat(1)).toBe("circle")
    expect(shapeForSeat(2)).toBe("triangle")
    expect(shapeForSeat(7)).toBe(shapeForSeat(1))
  })

  it("rejects a shape that is not one of the six marks", () => {
    expect(isPlayerMarkShape("circle")).toBe(true)
    expect(isPlayerMarkShape("octagon")).toBe(false)
    expect(isPlayerMarkShape(undefined)).toBe(false)
  })

  it("treats color and shape as one identity when checking collisions", () => {
    const taken = [{ color: RED, shape: "circle" as const }]

    expect(appearanceIsTaken(taken, { color: RED, shape: "circle" })).toBe(true)
    expect(appearanceIsTaken(taken, { color: RED, shape: "square" })).toBe(false)
    expect(appearanceIsTaken(taken, { color: BLUE, shape: "circle" })).toBe(false)
    expect(appearanceIsTaken(taken, { color: RED.toLowerCase(), shape: "circle" })).toBe(true)
  })

  it("honors a free request exactly as asked", () => {
    expect(
      resolveAppearance({ preferred: { color: BLUE, shape: "star" }, taken: [], seat: 3 }),
    ).toEqual({ color: BLUE.toUpperCase(), shape: "star" })
  })

  it("keeps the requested color and moves the shape when the pair is claimed", () => {
    const resolved = resolveAppearance({
      preferred: { color: RED, shape: "circle" },
      taken: [{ color: RED, shape: "circle" }],
      seat: 2,
    })

    expect(resolved.color).toBe(RED.toUpperCase())
    expect(resolved.shape).not.toBe("circle")
  })

  it("moves to another color only once every shape in the requested one is gone", () => {
    const taken = PLAYER_MARK_SHAPES.map((shape) => ({ color: RED, shape }))

    const resolved = resolveAppearance({
      preferred: { color: RED, shape: "circle" },
      taken,
      seat: 2,
    })

    expect(resolved.color).not.toBe(RED.toUpperCase())
    expect(appearanceIsTaken(taken, resolved)).toBe(false)
  })

  it("falls back to seat defaults when a joiner expresses no preference", () => {
    expect(resolveAppearance({ taken: [], seat: 2 })).toEqual({
      color: PLAYER_COLOR_CHOICES[1].toUpperCase(),
      shape: shapeForSeat(2),
    })
  })

  it("never hands two seats the same identity while combinations remain", () => {
    const taken: { color: string; shape: (typeof PLAYER_MARK_SHAPES)[number] }[] = []
    for (let seat = 1; seat <= 6; seat += 1) {
      const resolved = resolveAppearance({
        preferred: { color: RED, shape: "circle" },
        taken,
        seat,
      })
      expect(appearanceIsTaken(taken, resolved)).toBe(false)
      taken.push(resolved)
    }
    expect(new Set(taken.map((entry) => `${entry.color}:${entry.shape}`)).size).toBe(6)
  })
})
