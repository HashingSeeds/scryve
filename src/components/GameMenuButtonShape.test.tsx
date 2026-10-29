import { render } from "@testing-library/react-native"
import { ClipPath, Path } from "react-native-svg"

import {
  buildSoftCorners,
  buildSoftPolygonPath,
  GameMenuButtonShape,
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

function shape() {
  return render(<GameMenuButtonShape isDark={false} boardBackgroundColor="#FFFFFF" />)
}

describe("GameMenuButtonShape", () => {
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

  it("renders without a directional bevel in dark mode", () => {
    const view = render(<GameMenuButtonShape isDark boardBackgroundColor="#000000" />)
    expect(view.queryByTestId("game-menu-bevel")).toBeNull()
  })

  it("draws the directional bevel in light mode", () => {
    expect(shape().getByTestId("game-menu-bevel").findAllByType(Path)).toHaveLength(2)
  })

  it("clips the bevel to the visible face so it cannot overpaint the halo", () => {
    const view = shape()
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
  })

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

    it("measures the rounded outline's full length", () => {
      expect(softPolygonLength(corners)).toBeCloseTo(259.17, 1)
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
})
