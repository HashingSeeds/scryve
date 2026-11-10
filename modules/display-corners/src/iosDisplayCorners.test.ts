import { iosDisplayCornerRadii } from "./iosDisplayCorners"

describe("iosDisplayCornerRadii", () => {
  it("finds a model's radii by identifier, per corner, and scales them with Display Zoom", () => {
    expect(iosDisplayCornerRadii("iPhone13,1")).toEqual([44, 44, 44, 44])
    expect(iosDisplayCornerRadii("iPhone19,4")).toEqual([8, 59, 59, 8])
    expect(iosDisplayCornerRadii("iPad16,2")).toEqual([21.5, 21.5, 21.5, 21.5])
    expect(iosDisplayCornerRadii("iPhone13,1", 0.85)).toEqual([37.4, 37.4, 37.4, 37.4])
  })

  it("has no radius for square-cornered or unknown models", () => {
    expect(iosDisplayCornerRadii("iPhone14,6")).toBeNull()
    expect(iosDisplayCornerRadii("iPad7,11")).toBeNull()
    expect(iosDisplayCornerRadii("iPhone99,1")).toBeNull()
  })
})
