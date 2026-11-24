import { boardCornerRadii } from "./boardCorners"
import { getScreenCornerSquaringStyle } from "./PlayerGrid"
import type { CornerRadii } from "../../modules/display-corners"

const window: CornerRadii = [1, 2, 3, 4]

describe("boardCornerRadii", () => {
  it("gives a pinned board the window corner each of its corners faces, by the holder's angle", () => {
    const corners = (holderAngle: number) =>
      boardCornerRadii({ radii: window, frame: "window" }, { pinned: true, holderAngle })
    expect(corners(0)).toEqual([1, 2, 3, 4])
    expect(corners(90)).toEqual([4, 1, 2, 3])
    expect(corners(-90)).toEqual([2, 3, 4, 1])
    expect(corners(180)).toEqual([3, 4, 1, 2])
  })

  it("keeps iOS's upright corners on a pinned board, and none on a windowed one", () => {
    const even: CornerRadii = [44, 44, 44, 44]
    expect(
      boardCornerRadii({ radii: even, frame: "upright" }, { pinned: true, holderAngle: 90 }),
    ).toBe(even)
    expect(
      boardCornerRadii({ radii: even, frame: "upright" }, { pinned: false, holderAngle: 0 }),
    ).toBeNull()
    expect(boardCornerRadii(null, { pinned: true, holderAngle: 0 })).toBeNull()
  })
})

describe("screen corner radii on cards", () => {
  const rows = [
    [0, 1],
    [2, 3],
  ]
  it("rounds each outer card corner to its display corner", () => {
    const style = (rowIndex: number, columnIndex: number) =>
      getScreenCornerSquaringStyle({
        rows,
        rowIndex,
        columnIndex,
        displayRadii: window,
      })
    expect(style(0, 0)).toMatchObject({ borderTopLeftRadius: 1 })
    expect(style(0, 1)).toMatchObject({ borderTopRightRadius: 2 })
    expect(style(1, 1)).toMatchObject({ borderBottomRightRadius: 3 })
    expect(style(1, 0)).toMatchObject({ borderBottomLeftRadius: 4 })
    expect(style(1, 0)).not.toHaveProperty("borderTopLeftRadius")
  })

  it("keeps today's square corner where the display reports none", () => {
    expect(getScreenCornerSquaringStyle({ rows, rowIndex: 0, columnIndex: 0 })).toEqual({
      borderTopLeftRadius: 0,
    })
    expect(
      getScreenCornerSquaringStyle({
        rows,
        rowIndex: 0,
        columnIndex: 0,
        displayRadii: [null, 2, 3, 4],
      }),
    ).toMatchObject({ borderTopLeftRadius: 0 })
  })
})
