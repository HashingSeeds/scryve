import { attackerLayout, keypadPlacement, pulseFrame } from "./CommanderDamageCardControls"

describe("attackerLayout", () => {
  const rowWidth = (layout: ReturnType<typeof attackerLayout>) =>
    layout.perRow * layout.width + (layout.perRow - 1) * 16
  // why: the boxes' and the column's extents in the seat's upright space, measured from its top.
  const boxesTop = (space: { height: number }, layout: ReturnType<typeof attackerLayout>) =>
    space.height / 2 + layout.boxesY - layout.boxesHeight / 2

  it.each([
    [{ width: 455, height: 193 }, 2, { width: 86, height: 80 }, 32],
    [{ width: 455, height: 193 }, 1, { width: 86, height: 80 }, 32],
    [{ width: 390, height: 330 }, 2, undefined, 32],
    [{ width: 220, height: 150 }, 1, { width: 40, height: 40 }, 32],
    // why: a seat this small gives up the 32pt name bar before its margin.
    [{ width: 300, height: 140 }, 2, { width: 60, height: 60 }, 24],
    // why: a six-player phone seat, where the grid takes most of the width beside the boxes.
    [{ width: 278, height: 193 }, 2, { width: 102, height: 78 }, 32],
  ])(
    "keeps the boxes a margin inside a %o seat with %i commanders, clear of a %o grid",
    (space, count, grid, name) => {
      const layout = attackerLayout({ space, count, grid })
      const top = boxesTop(space, layout)
      expect(top).toBeGreaterThanOrEqual(16 - 0.5)
      expect(top + layout.columnHeight).toBeLessThanOrEqual(
        space.height - (layout.placement === "above" ? (grid?.height ?? 0) : 0) - 16 + 0.5,
      )
      const clear = layout.placement === "beside" ? (grid?.width ?? 0) : 0
      expect(rowWidth(layout)).toBeLessThanOrEqual(space.width - 32 - clear * 2)
      expect(layout.name).toBeGreaterThanOrEqual(name)
      expect(layout.width).toBeGreaterThanOrEqual(layout.height * 1.4)
    },
  )

  it("sets partners in one full-width row above a short seat's grid, with the life larger beside the grid", () => {
    const space = { width: 455, height: 193 }
    const layout = attackerLayout({ space, count: 2, grid: { width: 86, height: 80 } })
    expect(layout).toMatchObject({ placement: "above", rows: 1, perRow: 3 })
    expect(layout.lifeFont).toBeGreaterThan(
      attackerLayout({ space, count: 1, grid: { width: 86, height: 80 } }).lifeFont,
    )
  })
})

describe("keypadPlacement", () => {
  it("stacks the keypad under the box when a narrow seat leaves no room beside it", () => {
    const space = { width: 150, height: 220 }
    const keypad = keypadPlacement(space, attackerLayout({ space, count: 1, others: false }), true)
    expect(keypad).toMatchObject({ stacked: true, compact: true })
    expect(keypad.width).toBeGreaterThanOrEqual(100)
    expect(keypad.height).toBeGreaterThan(0)
  })
})

describe("pulseFrame", () => {
  it("leaves nothing visible between and after pulses, and grows outward", () => {
    expect(pulseFrame(0, 0.6).opacity).toBeCloseTo(0)
    expect(pulseFrame(1, 0.6).opacity).toBeCloseTo(0)
    expect(pulseFrame(0.5, 0.6).opacity).toBeGreaterThan(0)
    expect(pulseFrame(0, 0.6).scale).toBeLessThan(pulseFrame(1, 0.6).scale)
  })
})
