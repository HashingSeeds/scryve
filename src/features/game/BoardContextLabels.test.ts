import { contextLabelPlacements } from "./BoardContextLabels"

const insets = { top: 50, right: 0, bottom: 34, left: 0 }

describe("contextLabelPlacements", () => {
  it("puts each copy above its own seat's identity row on a stacked phone board", () => {
    const [far, near] = contextLabelPlacements({
      facings: [180, 0],
      size: { width: 375, height: 812 },
      insets,
    })
    expect(far).toEqual({ left: 0, top: 86, width: 375, turn: 180 })
    expect(near).toEqual({ left: 0, top: 724, width: 375, turn: 0 })
  })

  it("keeps each copy inside one seat when the stacked board is drawn sideways", () => {
    const [far, near] = contextLabelPlacements({
      facings: [180, 0],
      rotation: 90,
      size: { width: 1133, height: 744 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    expect(far).toEqual({ left: 700, top: 363, width: 744, turn: -90 })
    expect(near).toEqual({ left: -311, top: 363, width: 744, turn: 90 })
  })
})
