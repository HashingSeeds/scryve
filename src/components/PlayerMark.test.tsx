import { StyleSheet, View } from "react-native"
import { render } from "@testing-library/react-native"
import { Circle } from "react-native-svg"

import { PlayerMark } from "./PlayerMark"

const MARK_CENTER = 22
const SWORD_GLYPH_BOUNDS = { left: 6.8, right: 17.2, top: 2.5, bottom: 21.5 }

describe("PlayerMark", () => {
  it.each([
    [1, "circle"],
    [2, "triangle"],
    [3, "square"],
    [4, "diamond"],
    [5, "star"],
    [6, "hexagon"],
  ])("gives seat %i a stable %s mark", (seatNumber, shape) => {
    const view = render(<PlayerMark seatNumber={seatNumber} color="#FFFFFF" rotation={90} />)

    const mark = view.getByTestId(`player-mark-seat-${seatNumber}`, {
      includeHiddenElements: true,
    })
    expect(
      view.getByTestId(`player-mark-shape-${shape}`, { includeHiddenElements: true }),
    ).toBeTruthy()
    expect(mark.props.accessible).toBe(false)
    expect(StyleSheet.flatten(mark.props.style)).toMatchObject({
      transform: [{ rotate: "90deg" }],
    })
    expect(view.UNSAFE_getByType(View)).toBeTruthy()
  })

  it("renders a standalone shape without a surrounding ring", () => {
    const view = render(<PlayerMark seatNumber={2} color="#FFFFFF" />)

    expect(view.UNSAFE_queryAllByType(Circle)).toHaveLength(0)
  })

  it("adds an inset direction line when the mark identifies the local player", () => {
    const view = render(<PlayerMark seatNumber={1} color="#FFFFFF" spinning />)

    expect(view.getByTestId("player-mark-spin-line", { includeHiddenElements: true })).toBeTruthy()
    expect(view.queryByTestId("player-mark-orbit-dot", { includeHiddenElements: true })).toBeNull()
    expect(
      view.getByTestId("player-mark-spinner-seat-1", { includeHiddenElements: true }),
    ).toBeTruthy()
  })

  it("cuts the sword out of the mark instead of stacking it on the direction line", () => {
    const view = render(
      <PlayerMark seatNumber={1} color="#FFFFFF" insetSwordColor="#2F7D5F" spinning />,
    )

    expect(view.getByTestId("player-mark-sword", { includeHiddenElements: true })).toBeTruthy()
    expect(view.queryByTestId("player-mark-spin-line", { includeHiddenElements: true })).toBeNull()
  })

  it.each([
    [1, "circle"],
    [2, "triangle"],
    [3, "square"],
    [4, "diamond"],
    [5, "star"],
    [6, "hexagon"],
  ])("keeps seat %i's sword inside the %s it is cut from", (seatNumber) => {
    const view = render(
      <PlayerMark seatNumber={seatNumber} color="#FFFFFF" insetSwordColor="#2F7D5F" />,
    )

    const [scale, , , , offsetX, offsetY] = view.getByTestId("player-mark-sword", {
      includeHiddenElements: true,
    }).props.matrix as number[]
    const left = offsetX + scale * SWORD_GLYPH_BOUNDS.left
    const right = offsetX + scale * SWORD_GLYPH_BOUNDS.right
    const top = offsetY + scale * SWORD_GLYPH_BOUNDS.top
    const bottom = offsetY + scale * SWORD_GLYPH_BOUNDS.bottom

    expect((left + right) / 2).toBeCloseTo(MARK_CENTER, 1)
    expect(left).toBeGreaterThan(17)
    expect(right).toBeLessThan(27)
    expect(top).toBeGreaterThan(15)
    expect(bottom).toBeLessThan(31)
  })
})
