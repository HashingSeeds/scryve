import { StyleSheet, View } from "react-native"
import { render } from "@testing-library/react-native"
import { Circle } from "react-native-svg"

import { PlayerMark } from "./PlayerMark"

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
})
