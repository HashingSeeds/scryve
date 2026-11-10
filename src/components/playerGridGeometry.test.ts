import { contentDirectionToward } from "./playerGridGeometry"

const seat = (x: number, y: number) => ({ card: { x, y, width: 100, height: 100 } })

describe("contentDirectionToward", () => {
  it("reads the neighbor's side from the seat's own facing", () => {
    expect(contentDirectionToward({ ...seat(0, 0), rotation: 0 }, seat(100, 0))).toBe("right")
    expect(contentDirectionToward({ ...seat(0, 0), rotation: 0 }, seat(0, -100))).toBe("up")
    expect(contentDirectionToward({ ...seat(0, 0), rotation: 90 }, seat(100, 0))).toBe("up")
    expect(contentDirectionToward({ ...seat(0, 0), rotation: 90 }, seat(0, 100))).toBe("right")
    expect(contentDirectionToward({ ...seat(100, 0), rotation: -90 }, seat(100, 100))).toBe("left")
    expect(contentDirectionToward({ ...seat(0, 0), rotation: 180 }, seat(0, 100))).toBe("up")
    expect(contentDirectionToward({ ...seat(0, 0), rotation: 180 }, seat(100, 0))).toBe("left")
  })
})
