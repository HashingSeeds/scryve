import { turnChipLeft } from "./TurnChip"

describe("turnChipLeft", () => {
  const chip = { run: 300, width: 100 }

  it("centers the chip on the card's far edge", () => {
    expect(turnChipLeft({ ...chip, rotation: 0 })).toBe(100)
    expect(turnChipLeft({ ...chip, rotation: 90, menuEdgeCenter: "left" })).toBe(100)
  })

  it("slides along the edge just clear of a pentagon centered on it", () => {
    const wide = { run: 400, width: 100 }
    expect(turnChipLeft({ ...wide, rotation: 0, menuEdgeCenter: "top" })).toBe(248)
    expect(turnChipLeft({ ...wide, rotation: 180, menuEdgeCenter: "bottom" })).toBe(248)
    expect(turnChipLeft({ ...chip, rotation: 0, menuEdgeCenter: "top" })).toBe(192)
  })

  it("steps past a pentagon in a corner of that edge only when they would touch", () => {
    expect(turnChipLeft({ ...chip, rotation: 0, menuCorner: "topLeft" })).toBe(100)
    const short = { run: 160, width: 100 }
    expect(turnChipLeft({ ...short, rotation: 0, menuCorner: "topLeft" })).toBe(48)
    expect(turnChipLeft({ ...short, rotation: 90, menuCorner: "bottomRight" })).toBe(12)
  })
})
