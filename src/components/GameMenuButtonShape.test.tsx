import { render } from "@testing-library/react-native"
import { ClipPath, Path, Polygon, Polyline } from "react-native-svg"

import {
  buildSweepWedges,
  DEFAULT_MENU_BUTTON_STYLE,
  GameMenuButtonShape,
  isMenuButtonStyle,
  MENU_BUTTON_STYLES,
  mixColorsInLinearLight,
} from "./GameMenuButtonShape"

const RED = "#FF0000"
const BLUE = "#0000FF"
const PENTAGON_CENTER = 50

function radiusOf(points: string): number {
  return Math.max(
    ...points.split(" ").map((corner) => {
      const [x, y] = corner.split(",").map(Number)
      return Math.hypot(x - PENTAGON_CENTER, y - PENTAGON_CENTER)
    }),
  )
}

function shape(variant: (typeof MENU_BUTTON_STYLES)[number], seatColors?: readonly string[]) {
  return render(
    <GameMenuButtonShape
      variant={variant}
      isDark={false}
      boardBackgroundColor="#FFFFFF"
      seatColors={seatColors}
    />,
  )
}

describe("GameMenuButtonShape", () => {
  it("defaults to the shipped keystone treatment", () => {
    expect(DEFAULT_MENU_BUTTON_STYLE).toBe("keystoneIIFlat")
    expect(isMenuButtonStyle("keystoneIIFlat")).toBe(true)
    expect(isMenuButtonStyle("prismFlat")).toBe(true)
    expect(isMenuButtonStyle("keystoneII")).toBe(false)
    expect(isMenuButtonStyle("prism")).toBe(false)
    expect(isMenuButtonStyle("sparkle")).toBe(false)
    expect(isMenuButtonStyle(undefined)).toBe(false)
  })

  it.each(MENU_BUTTON_STYLES)("renders the %s treatment", (variant) => {
    expect(shape(variant).getByTestId("game-menu-pentagon")).toBeTruthy()
  })

  it("mixes colors through linear light rather than darkening at the midpoint", () => {
    const midpoint = mixColorsInLinearLight(RED, BLUE, 0.5)
    expect(mixColorsInLinearLight(RED, BLUE, 0)).toBe(RED.toLowerCase())
    expect(mixColorsInLinearLight(RED, BLUE, 1)).toBe(BLUE.toLowerCase())
    const [red, , blue] = [
      parseInt(midpoint.slice(1, 3), 16),
      0,
      parseInt(midpoint.slice(5, 7), 16),
    ]
    expect(red).toBe(blue)
    expect(red).toBeGreaterThan(128)
  })

  it("closes the sweep so the last wedge lands back on the first seat color", () => {
    const wedges = buildSweepWedges([RED, BLUE], 4)
    expect(wedges).toHaveLength(4)
    expect(wedges[0].from).toBe(RED.toLowerCase())
    expect(wedges[3].to).toBe(wedges[0].from)
    wedges.forEach((wedge, index) => {
      if (index > 0) expect(wedge.from).toBe(wedges[index - 1].to)
    })
  })

  it("returns no wedges when a board has no seat colors", () => {
    expect(buildSweepWedges([], 8)).toEqual([])
  })

  it("draws one prism wedge per subdivision regardless of seat count", () => {
    const twoSeats = shape("prismFlat", ["#B85636", "#41476E"]).UNSAFE_getAllByType(Path)
    const sixSeats = shape("prismFlat", [
      "#B85636",
      "#41476E",
      "#39755C",
      "#94632D",
      "#77558A",
      "#A33A52",
    ]).UNSAFE_getAllByType(Path)
    expect(twoSeats.length).toBe(sixSeats.length)
    expect(twoSeats.length).toBeGreaterThan(0)
  })

  it.each(MENU_BUTTON_STYLES)("renders %s without a directional bevel in dark mode", (variant) => {
    const view = render(
      <GameMenuButtonShape variant={variant} isDark boardBackgroundColor="#000000" />,
    )
    expect(view.UNSAFE_queryAllByType(Polyline)).toHaveLength(0)
  })

  it.each(MENU_BUTTON_STYLES)("preserves the current %s treatment in light mode", (variant) => {
    expect(shape(variant).UNSAFE_getAllByType(Polyline)).toHaveLength(2)
  })

  it.each(MENU_BUTTON_STYLES)(
    "clips the %s bevel to the visible face so it cannot overpaint the halo",
    (variant) => {
      const view = shape(variant)
      const halo = view
        .UNSAFE_getAllByType(Polygon)
        .find((polygon) => polygon.props.stroke === "#FFFFFF" && polygon.props.strokeWidth === 7)
      const clip = view.UNSAFE_getByType(ClipPath).props.children
      expect(halo).toBeTruthy()
      expect(radiusOf(clip.props.points)).toBeCloseTo(
        radiusOf(halo!.props.points) - halo!.props.strokeWidth / 2,
        5,
      )
      const bevelReach = Math.max(
        ...view.UNSAFE_getAllByType(Polyline).map((line) => radiusOf(line.props.points)),
      )
      expect(bevelReach).toBeLessThanOrEqual(radiusOf(clip.props.points) + 1e-6)
    },
  )

  it("falls back to the default palette when a board reports no seats", () => {
    expect(shape("prismFlat", []).UNSAFE_getAllByType(Path).length).toBeGreaterThan(0)
  })
})
