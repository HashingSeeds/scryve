import {
  ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES,
  appearanceIsTaken,
  CONNECTED_PLAYER_MARK_SHAPES,
  isPlayerMarkShape,
  isProMarkShape,
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  PRO_MARK_SHAPES,
  resolveAppearance,
  shapeForSeat,
  withoutProMarks,
  type PlayerAppearance,
} from "./appearance"
import { MAX_PLAYERS } from "./policy"

const RED = PLAYER_COLOR_CHOICES[0]
const BLUE = PLAYER_COLOR_CHOICES[1]

describe("player appearance", () => {
  it("defaults seat one to heart while keeping legacy circle readable", () => {
    expect(shapeForSeat(1)).toBe("heart")
    expect(shapeForSeat(2)).toBe("triangle")
    expect(shapeForSeat(7)).toBe(shapeForSeat(1))
    expect(shapeForSeat(1, PLAYER_MARK_SHAPES)).toBe("heart")
    expect(PLAYER_MARK_SHAPES).toHaveLength(8)
    expect(PLAYER_MARK_SHAPES).not.toContain("circle")
    expect(CONNECTED_PLAYER_MARK_SHAPES).not.toContain("circle")
    expect(ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES).toContain("circle")
    expect(isPlayerMarkShape("circle")).toBe(true)
    expect(isPlayerMarkShape("heart")).toBe(true)
    expect(isPlayerMarkShape("plus")).toBe(true)
    expect(isPlayerMarkShape("shield")).toBe(true)
    expect(isPlayerMarkShape("octagon")).toBe(false)
    expect(isPlayerMarkShape(undefined)).toBe(false)
    expect(PLAYER_COLOR_CHOICES.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
    expect(CONNECTED_PLAYER_MARK_SHAPES.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it("reads Pro marks without offering them to seat defaults or connected lobbies", () => {
    for (const shape of PRO_MARK_SHAPES) {
      expect(isPlayerMarkShape(shape)).toBe(true)
      expect(isProMarkShape(shape)).toBe(true)
      expect(PLAYER_MARK_SHAPES).not.toContain(shape)
      expect(ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES).not.toContain(shape)
    }
    expect(isProMarkShape("heart")).toBe(false)
  })

  it("trades Pro marks for unused free marks and keeps every other choice", () => {
    expect(
      withoutProMarks([
        { color: RED, shape: "crown" },
        { color: BLUE, shape: "heart" },
        { color: PLAYER_COLOR_CHOICES[2], shape: "eye" },
      ]),
    ).toEqual([
      { color: RED, shape: "triangle" },
      { color: BLUE, shape: "heart" },
      { color: PLAYER_COLOR_CHOICES[2], shape: "square" },
    ])
  })

  it("reserves colors and shapes independently, ignoring color casing", () => {
    const taken = [{ color: RED, shape: "circle" as const }]
    expect(appearanceIsTaken(taken, { color: RED, shape: "square" })).toBe(true)
    expect(appearanceIsTaken(taken, { color: BLUE, shape: "circle" })).toBe(true)
    expect(appearanceIsTaken(taken, { color: RED.toLowerCase(), shape: "star" })).toBe(true)
    expect(appearanceIsTaken(taken, { color: BLUE, shape: "star" })).toBe(false)
  })

  it("preserves each available preference when the other one conflicts", () => {
    const taken = [{ color: RED, shape: "heart" as const }]
    expect(resolveAppearance({ preferred: { color: RED, shape: "star" }, taken, seat: 2 })).toEqual(
      { color: BLUE, shape: "star" },
    )
    expect(
      resolveAppearance({
        preferred: { color: BLUE, shape: "heart" },
        taken,
        seat: 2,
        shapes: CONNECTED_PLAYER_MARK_SHAPES,
      }),
    ).toEqual({ color: BLUE, shape: "triangle" })
  })

  it("assigns unique colors and shapes to a full roster with identical preferences", () => {
    const taken: PlayerAppearance[] = []
    for (let seat = 1; seat <= MAX_PLAYERS; seat += 1) {
      const appearance = resolveAppearance({
        preferred: { color: RED.toLowerCase(), shape: "circle" },
        taken,
        seat,
        shapes: CONNECTED_PLAYER_MARK_SHAPES,
      })
      expect(appearanceIsTaken(taken, appearance)).toBe(false)
      taken.push(appearance)
    }
    expect(new Set(taken.map(({ color }) => color)).size).toBe(MAX_PLAYERS)
    expect(new Set(taken.map(({ shape }) => shape)).size).toBe(MAX_PLAYERS)
  })

  it("uses seat defaults when no preference is supplied", () => {
    expect(resolveAppearance({ taken: [], seat: 2 })).toEqual({ color: BLUE, shape: "triangle" })
  })

  it.each(["plus", "shield"] as const)("maps local %s to a compatible hosted mark", (shape) => {
    expect(
      resolveAppearance({
        preferred: { color: BLUE, shape },
        taken: [],
        seat: 2,
        shapes: CONNECTED_PLAYER_MARK_SHAPES,
      }),
    ).toEqual({ color: BLUE, shape: "heart" })
  })

  it("keeps a legacy circle the server still accepts", () => {
    expect(
      resolveAppearance({
        preferred: { color: BLUE, shape: "circle" },
        taken: [],
        seat: 1,
        shapes: ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES,
      }),
    ).toEqual({ color: BLUE, shape: "circle" })
  })

  it("fails instead of reusing an appearance when either catalog is exhausted", () => {
    const taken = PLAYER_MARK_SHAPES.map((shape, index) => ({
      color: PLAYER_COLOR_CHOICES[index],
      shape,
    }))
    expect(() => resolveAppearance({ taken, seat: 9 })).toThrow("No unused")
    expect(() =>
      resolveAppearance({
        taken: [{ color: RED, shape: "circle" }],
        seat: 2,
        shapes: ["circle"],
      }),
    ).toThrow("No unused")
  })
})
