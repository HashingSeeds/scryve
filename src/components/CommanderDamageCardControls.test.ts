import { attackerLayout, hitAngle, keypadPlacement } from "./CommanderDamageCardControls"

describe("attackerLayout", () => {
  const rowWidth = (layout: ReturnType<typeof attackerLayout>, count: number) =>
    count * layout.width + (count - 1) * 16

  it.each([
    [{ width: 416, height: 189 }, 2, { head: 38, foot: 50 }],
    [{ width: 416, height: 189 }, 1, { head: 38, foot: 50 }],
    [{ width: 390, height: 330 }, 2, { head: 40, foot: 56 }],
    [{ width: 220, height: 150 }, 1, { head: 30, foot: 40 }],
    [{ width: 300, height: 120 }, 2, { head: 30, foot: 40 }],
  ])(
    "keeps the boxes of a %o seat with %i commanders between the life at its head and the name row at its foot",
    (space, count, bands) => {
      const layout = attackerLayout({ space, count, bands })
      const middle = space.height / 2 + layout.boxesY
      const tall = layout.height + layout.name
      expect(middle - tall / 2).toBeGreaterThanOrEqual(bands.head)
      expect(middle + tall / 2).toBeLessThanOrEqual(space.height - bands.foot)
      expect(rowWidth(layout, count)).toBeLessThanOrEqual(space.width - 32)
      expect(layout.width).toBeGreaterThanOrEqual(layout.height * 1.4)
    },
  )

  it("centres the boxes on the card when nothing reserves its head or foot", () => {
    expect(attackerLayout({ space: { width: 416, height: 300 }, count: 1 }).boxesY).toBe(0)
  })
})

describe("keypadPlacement", () => {
  it("stacks the keypad under the box when a narrow seat leaves no room beside it", () => {
    const space = { width: 150, height: 220 }
    const keypad = keypadPlacement(space, attackerLayout({ space, count: 1 }), true)
    expect(keypad).toMatchObject({ stacked: true, compact: true })
    expect(keypad.width).toBeGreaterThanOrEqual(100)
    expect(keypad.height).toBeGreaterThan(0)
  })
})

describe("hitAngle", () => {
  it("keeps each hit's spot as more land, then closes them up so the arc never grows", () => {
    const arc = (count: number) =>
      Array.from({ length: count }, (_, index) => hitAngle(index, count))
    expect(arc(3)).toEqual([-35, -21, -7])
    expect(arc(6)).toEqual([-35, -21, -7, 7, 21, 35])
    const crowded = arc(8)
    expect(crowded[0]).toBe(-35)
    expect(crowded.at(-1)).toBeCloseTo(35)
    expect(crowded[1] - crowded[0]).toBeLessThan(14)
  })
})
