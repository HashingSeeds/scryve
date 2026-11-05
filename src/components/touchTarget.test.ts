import { targetSlop } from "./touchTarget"

describe("targetSlop", () => {
  it("grows a small control to 48 dp evenly", () => {
    expect(targetSlop({ width: 28, height: 32 })).toEqual({
      top: 8,
      bottom: 8,
      left: 10,
      right: 10,
    })
  })

  it("moves the slop away from an edge with no room", () => {
    expect(targetSlop({ width: 48, height: 28 }, { top: 4 })).toEqual({
      top: 4,
      bottom: 16,
      left: 0,
      right: 0,
    })
  })

  it("keeps at least the least slop", () => {
    expect(targetSlop({ width: 60, height: 60 }, {}, 12)).toEqual({
      top: 12,
      bottom: 12,
      left: 12,
      right: 12,
    })
  })
})
