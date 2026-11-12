import { namePanelLayout } from "./CounterNamePanel"

const board = { x: 0, y: 0, width: 393, height: 852 }
const safe = { x: 0, y: 59, width: 393, height: 759 }
const contains = (
  outer: { x: number; y: number; width: number; height: number },
  inner: typeof outer,
) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height

describe("namePanelLayout", () => {
  it("stretches a short side seat along its column to full-size keys", () => {
    const seat = { x: 0, y: 0, width: 195, height: 280 }
    const layout = namePanelLayout({
      seat,
      board,
      safe,
      rotation: 90,
      close: { left: 236, top: 153, size: 30 },
    })

    expect(layout.keyWidth).toBe(44)
    expect(contains(layout.rect, seat)).toBe(true)
    expect(contains(board, layout.rect)).toBe(true)
    expect(layout.rect.height).toBeGreaterThan(470)
    expect(layout.rect.width - seat.width).toBeGreaterThan(40)
    expect(layout.rect.width - seat.width).toBeLessThan(70)
  })

  it("gives an upright end seat the ten keys its width allows and grows it toward the centre", () => {
    const seat = { x: 0, y: 0, width: 393, height: 100 }
    const layout = namePanelLayout({
      seat,
      board,
      safe,
      rotation: 180,
      close: { left: 351, top: 58, size: 30 },
    })

    expect(layout.keyWidth).toBeGreaterThan(33)
    expect(layout.keyWidth).toBeLessThan(35)
    expect(layout.rect).toMatchObject({ x: 0, y: 0, width: 393 })
    expect(layout.rect.height).toBeGreaterThan(230)
  })
})
