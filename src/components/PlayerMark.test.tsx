import { StyleSheet, View } from "react-native"
import { render } from "@testing-library/react-native"
import { Circle, LinearGradient, Stop } from "react-native-svg"

import { PlayerMark } from "./PlayerMark"

const MARK_CENTER = 22
const SWORD_GLYPH_BOUNDS = { left: 6.8, right: 17.2, top: 2.5, bottom: 21.5 }

describe("PlayerMark", () => {
  it.each(["heart", "plus", "shield", "crown", "flame", "bolt", "eye"] as const)(
    "renders the new %s mark and its sword",
    (shape) => {
      const view = render(
        <PlayerMark seatNumber={1} color="#FFFFFF" shape={shape} insetSwordColor="#117B9C" />,
      )
      expect(
        view.getByTestId(`player-mark-shape-${shape}`, { includeHiddenElements: true }),
      ).toBeTruthy()
      expect(view.getByTestId("player-mark-sword", { includeHiddenElements: true })).toBeTruthy()
    },
  )
  it.each([
    [1, "heart"],
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

  it("fills only a foil mark with a gradient", () => {
    const flat = render(<PlayerMark seatNumber={1} color="#FFFFFF" shape="crown" />)
    expect(flat.UNSAFE_queryAllByType(LinearGradient)).toHaveLength(0)

    const foil = render(<PlayerMark seatNumber={1} color="#FFFFFF" shape="crown" foil />)
    expect(foil.UNSAFE_queryAllByType(LinearGradient)).toHaveLength(1)
  })

  it("darkens foil on a light backdrop and lightens it on a dark one", () => {
    const firstStop = (props: { color: string; foilBackdrop?: string }) =>
      render(<PlayerMark seatNumber={1} shape="crown" foil {...props} />).UNSAFE_getAllByType(
        Stop,
      )[0].props.stopColor
    expect(firstStop({ color: "#B85636", foilBackdrop: "#F4F2F1" })).toBe("#4A3A0A")
    expect(firstStop({ color: "#B85636", foilBackdrop: "#000000" })).toBe("#F6E7B0")
    expect(firstStop({ color: "#000000" })).toBe("#4A3A0A")
    expect(firstStop({ color: "#FFFFFF" })).toBe("#F6E7B0")
  })

  it("renders a standalone shape without a surrounding ring", () => {
    const view = render(<PlayerMark seatNumber={2} color="#FFFFFF" />)

    expect(view.UNSAFE_queryAllByType(Circle)).toHaveLength(0)
  })

  it("shows a close X instead of a sword when the mark becomes the close button", () => {
    const view = render(
      <PlayerMark seatNumber={1} color="#FFFFFF" insetSwordColor="#2F7D5F" closeIcon />,
    )

    expect(view.getByTestId("player-mark-close", { includeHiddenElements: true })).toBeTruthy()
    expect(view.queryByTestId("player-mark-sword", { includeHiddenElements: true })).toBeNull()
  })

  it("keeps a single sword while the mark opens its board", () => {
    const view = render(<PlayerMark seatNumber={1} color="#FFFFFF" insetSwordColor="#2F7D5F" />)

    expect(view.getByTestId("player-mark-sword", { includeHiddenElements: true })).toBeTruthy()
    expect(view.queryByTestId("player-mark-close", { includeHiddenElements: true })).toBeNull()
  })

  it("needs an inset color before a close X can render", () => {
    const view = render(<PlayerMark seatNumber={1} color="#FFFFFF" closeIcon />)

    expect(view.queryByTestId("player-mark-close", { includeHiddenElements: true })).toBeNull()
  })

  it.each([
    [1, "heart"],
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
