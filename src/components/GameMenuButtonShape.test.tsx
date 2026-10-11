import { render } from "@testing-library/react-native"
import { ClipPath, Path } from "react-native-svg"

import {
  buildSoftCorners,
  buildSoftPolygonPath,
  buildSweepWedges,
  DEFAULT_MENU_BUTTON_STYLE,
  GameMenuButtonShape,
  isMenuButtonStyle,
  MENU_BUTTON_STYLES,
  mixColorsInLinearLight,
  PENTAGON_BADGE_ANCHOR,
  softPolygonLength,
} from "./GameMenuButtonShape"

const RED = "#FF0000"
const BLUE = "#0000FF"
const PENTAGON_CENTER = 50

function farthestTipRadius(path: string): number {
  return Math.max(
    ...Array.from(path.matchAll(/Q([\d.]+),([\d.]+)/g), ([, x, y]) =>
      Math.hypot(Number(x) - PENTAGON_CENTER, Number(y) - PENTAGON_CENTER),
    ),
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
    expect(view.queryByTestId("game-menu-bevel")).toBeNull()
  })

  it.each(MENU_BUTTON_STYLES)("preserves the current %s treatment in light mode", (variant) => {
    expect(shape(variant).getByTestId("game-menu-bevel").findAllByType(Path)).toHaveLength(2)
  })

  it.each(MENU_BUTTON_STYLES)("renders %s without an exterior shadow", (variant) => {
    const paths = shape(variant).UNSAFE_getAllByType(Path)
    expect(paths.every((path) => path.props.translateY === undefined)).toBe(true)
  })

  it.each(MENU_BUTTON_STYLES)(
    "clips the %s bevel to the visible face so it cannot overpaint the halo",
    (variant) => {
      const view = shape(variant)
      const halo = view
        .UNSAFE_getAllByType(Path)
        .find((path) => path.props.stroke === "#FFFFFF" && path.props.strokeWidth === 7)
      const clip = view.UNSAFE_getByType(ClipPath).props.children
      expect(halo).toBeTruthy()
      expect(farthestTipRadius(clip.props.d)).toBeCloseTo(
        farthestTipRadius(halo!.props.d) - halo!.props.strokeWidth / 2,
        5,
      )
      const bevelReach = Math.max(
        ...view
          .UNSAFE_getByProps({ testID: "game-menu-bevel" })
          .findAllByType(Path)
          .map((line) => farthestTipRadius(line.props.d)),
      )
      expect(bevelReach).toBeLessThanOrEqual(farthestTipRadius(clip.props.d) + 1e-6)
    },
  )

  describe("soft corners", () => {
    const corners = buildSoftCorners({ sides: 5, center: 50, radius: 46, cornerRadius: 9 })

    it("starts and ends each curve the corner radius away from its sharp tip", () => {
      corners.forEach(({ enter, tip, exit }) => {
        expect(Math.hypot(enter.x - tip.x, enter.y - tip.y)).toBeCloseTo(9, 5)
        expect(Math.hypot(exit.x - tip.x, exit.y - tip.y)).toBeCloseTo(9, 5)
      })
    })

    it("draws one closed curve per corner", () => {
      const path = buildSoftPolygonPath(corners)
      expect(path.match(/Q/g)).toHaveLength(5)
      expect(path.endsWith("Z")).toBe(true)
    })

    it("shortens the outline compared with sharp corners", () => {
      const sharp = buildSoftCorners({ sides: 5, center: 50, radius: 46, cornerRadius: 0 })
      expect(softPolygonLength(corners)).toBeLessThan(softPolygonLength(sharp))
    })

    it("keeps the badge anchor on a straight stretch of the border", () => {
      const [apex, upperRight] = corners
      const anchor = {
        x: PENTAGON_BADGE_ANCHOR.x * 100,
        y: PENTAGON_BADGE_ANCHOR.y * 100,
      }
      const fromUpperRight = Math.hypot(anchor.x - upperRight.tip.x, anchor.y - upperRight.tip.y)
      const fromApex = Math.hypot(anchor.x - apex.tip.x, anchor.y - apex.tip.y)
      expect(fromUpperRight).toBeGreaterThan(9)
      expect(fromApex).toBeGreaterThan(9)
    })
  })

  it("falls back to the default palette when a board reports no seats", () => {
    expect(shape("prismFlat", []).UNSAFE_getAllByType(Path).length).toBeGreaterThan(0)
  })
})
