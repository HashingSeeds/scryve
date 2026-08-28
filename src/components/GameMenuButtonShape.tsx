import type { ReactElement } from "react"
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Stop,
} from "react-native-svg"

import { PLAYER_COLORS } from "@/features/game/domain"

export type MenuButtonStyle = "keystoneIIFlat" | "prismFlat"

export const MENU_BUTTON_STYLES = ["keystoneIIFlat", "prismFlat"] as const

export const DEFAULT_MENU_BUTTON_STYLE: MenuButtonStyle = "keystoneIIFlat"

export const MENU_BUTTON_STYLE_LABELS: Record<MenuButtonStyle, string> = {
  keystoneIIFlat: "Keystone II",
  prismFlat: "Prism",
}

export function isMenuButtonStyle(value: unknown): value is MenuButtonStyle {
  return MENU_BUTTON_STYLES.includes(value as MenuButtonStyle)
}

const PENTAGON_SIDES = 5
const PENTAGON_VIEWBOX = 100
const PENTAGON_CENTER = PENTAGON_VIEWBOX / 2
const PENTAGON_RADIUS = 46
const PENTAGON_STROKE_WIDTH = 7
const HAIRLINE_STROKE_WIDTH = 1.4

const WEDGES_NARROW_ENOUGH_TO_HIDE_THEIR_SEAMS = 12
const SWEEP_DIM_OPACITY = { light: 0.72, dark: 0.66 } as const
const SWEEP_SHEEN_OPACITY = 0.16

const KEYSTONE_II_FACE = {
  light: { top: "#3F3C47", bottom: "#17161C" },
  dark: { top: "#46434E", bottom: "#26242C" },
} as const

const KEYSTONE_II_BEVEL = { shade: 0.48, light: 0.4 } as const
const PRISM_BEVEL = { shade: 0.36, light: 0.22 } as const
const BEVEL_SHADE_STROKE_WIDTH = 6.5
const BEVEL_LIGHT_STROKE_WIDTH = 5.5

export function buildRegularPolygonPoints(input: {
  sides: number
  center: number
  radius: number
}): string {
  const pointingUp = -Math.PI / 2
  return Array.from({ length: input.sides }, (_, corner) => {
    const angle = pointingUp + (Math.PI * 2 * corner) / input.sides
    const x = input.center + input.radius * Math.cos(angle)
    const y = input.center + input.radius * Math.sin(angle)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(" ")
}

const PENTAGON_POINTS = buildRegularPolygonPoints({
  sides: PENTAGON_SIDES,
  center: PENTAGON_CENTER,
  radius: PENTAGON_RADIUS,
})

const FACE_RADIUS = PENTAGON_RADIUS - PENTAGON_STROKE_WIDTH / 2

const FACE_POINTS = buildRegularPolygonPoints({
  sides: PENTAGON_SIDES,
  center: PENTAGON_CENTER,
  radius: FACE_RADIUS,
})

const FACE_CORNERS_CLOCKWISE_FROM_APEX = FACE_POINTS.split(" ")
const EDGES_FACING_AN_UPPER_LEFT_LIGHT = [3, 4, 0]
  .map((corner) => FACE_CORNERS_CLOCKWISE_FROM_APEX[corner])
  .join(" ")
const EDGES_FACING_AWAY_FROM_AN_UPPER_LEFT_LIGHT = [1, 2, 3]
  .map((corner) => FACE_CORNERS_CLOCKWISE_FROM_APEX[corner])
  .join(" ")

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "")
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ]
}

function toHex(channels: [number, number, number]): string {
  return `#${channels.map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`
}

export function mixColorsInLinearLight(from: string, to: string, ratio: number): string {
  const start = parseHex(from)
  const end = parseHex(to)
  return toHex(
    start.map((channel, index) => {
      const linear =
        (1 - ratio) * Math.pow(channel / 255, 2.2) + ratio * Math.pow(end[index] / 255, 2.2)
      return Math.pow(linear, 1 / 2.2) * 255
    }) as [number, number, number],
  )
}

export interface SweepWedge {
  key: string
  path: string
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

function seatColorAtTurn(seatColors: readonly string[], turn: number): string {
  const wrapped = ((turn % 1) + 1) % 1
  const exact = wrapped * seatColors.length
  const index = Math.floor(exact)
  return mixColorsInLinearLight(
    seatColors[index % seatColors.length],
    seatColors[(index + 1) % seatColors.length],
    exact - index,
  )
}

export function buildSweepWedges(
  seatColors: readonly string[],
  wedgeCount: number = WEDGES_NARROW_ENOUGH_TO_HIDE_THEIR_SEAMS,
): SweepWedge[] {
  if (seatColors.length === 0) return []
  const radius = PENTAGON_RADIUS + PENTAGON_STROKE_WIDTH
  return Array.from({ length: wedgeCount }, (_, index) => {
    const startTurn = index / wedgeCount
    const endTurn = (index + 1) / wedgeCount
    const startAngle = startTurn * Math.PI * 2 - Math.PI / 2
    const endAngle = endTurn * Math.PI * 2 - Math.PI / 2
    const x1 = PENTAGON_CENTER + radius * Math.cos(startAngle)
    const y1 = PENTAGON_CENTER + radius * Math.sin(startAngle)
    const x2 = PENTAGON_CENTER + radius * Math.cos(endAngle)
    const y2 = PENTAGON_CENTER + radius * Math.sin(endAngle)
    return {
      key: `sweep-${index}`,
      path: `M${PENTAGON_CENTER},${PENTAGON_CENTER} L${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`,
      from: seatColorAtTurn(seatColors, startTurn),
      to: seatColorAtTurn(seatColors, endTurn),
      x1,
      y1,
      x2,
      y2,
    }
  })
}

function PentagonBevel({
  clipId,
  opacity,
}: {
  clipId: string
  opacity: { shade: number; light: number }
}): ReactElement {
  return (
    <G clipPath={`url(#${clipId})`}>
      <Polyline
        points={EDGES_FACING_AWAY_FROM_AN_UPPER_LEFT_LIGHT}
        fill="none"
        stroke="#000000"
        strokeOpacity={opacity.shade}
        strokeWidth={BEVEL_SHADE_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <Polyline
        points={EDGES_FACING_AN_UPPER_LEFT_LIGHT}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={opacity.light}
        strokeWidth={BEVEL_LIGHT_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </G>
  )
}

function PentagonHairline(): ReactElement {
  return (
    <Polygon
      points={FACE_POINTS}
      fill="none"
      stroke="#FFFFFF"
      strokeOpacity={0.22}
      strokeWidth={HAIRLINE_STROKE_WIDTH}
      strokeLinejoin="round"
    />
  )
}

export interface GameMenuButtonShapeProps {
  variant: MenuButtonStyle
  isDark: boolean
  boardBackgroundColor: string
  seatColors?: readonly string[]
}

export function GameMenuButtonShape({
  variant,
  isDark,
  boardBackgroundColor,
  seatColors,
}: GameMenuButtonShapeProps): ReactElement {
  return (
    <Svg
      testID="game-menu-pentagon"
      width="100%"
      height="100%"
      viewBox={`0 0 ${PENTAGON_VIEWBOX} ${PENTAGON_VIEWBOX}`}
    >
      {variant === "prismFlat" ? (
        <PrismShape
          isDark={isDark}
          boardBackgroundColor={boardBackgroundColor}
          seatColors={seatColors}
        />
      ) : (
        <KeystoneTwoShape isDark={isDark} boardBackgroundColor={boardBackgroundColor} />
      )}
    </Svg>
  )
}

function KeystoneTwoShape({
  isDark,
  boardBackgroundColor,
}: {
  isDark: boolean
  boardBackgroundColor: string
}): ReactElement {
  const face = isDark ? KEYSTONE_II_FACE.dark : KEYSTONE_II_FACE.light
  return (
    <>
      <Defs>
        <ClipPath id="keystoneTwoFace">
          <Polygon points={FACE_POINTS} />
        </ClipPath>
        <LinearGradient id="keystoneTwoFill" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor={face.top} />
          <Stop offset="1" stopColor={face.bottom} />
        </LinearGradient>
      </Defs>
      <Polygon
        points={PENTAGON_POINTS}
        fill="url(#keystoneTwoFill)"
        stroke={boardBackgroundColor}
        strokeWidth={PENTAGON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      {isDark ? null : <PentagonBevel clipId="keystoneTwoFace" opacity={KEYSTONE_II_BEVEL} />}
      <PentagonHairline />
    </>
  )
}

function PrismShape({
  isDark,
  boardBackgroundColor,
  seatColors,
}: {
  isDark: boolean
  boardBackgroundColor: string
  seatColors?: readonly string[]
}): ReactElement {
  const palette = seatColors && seatColors.length > 0 ? seatColors : PLAYER_COLORS
  const wedges = buildSweepWedges(palette)
  return (
    <>
      <Defs>
        <ClipPath id="prismFace">
          <Polygon points={FACE_POINTS} />
        </ClipPath>
        {wedges.map((wedge) => (
          <LinearGradient
            key={`${wedge.key}-gradient`}
            id={`${wedge.key}-gradient`}
            gradientUnits="userSpaceOnUse"
            x1={wedge.x1}
            y1={wedge.y1}
            x2={wedge.x2}
            y2={wedge.y2}
          >
            <Stop offset="0" stopColor={wedge.from} />
            <Stop offset="1" stopColor={wedge.to} />
          </LinearGradient>
        ))}
        <RadialGradient id="prismSheen" cx="0.34" cy="0.26" r="0.78">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={SWEEP_SHEEN_OPACITY} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <G clipPath="url(#prismFace)">
        {wedges.map((wedge) => (
          <Path key={wedge.key} d={wedge.path} fill={`url(#${wedge.key}-gradient)`} />
        ))}
        <Polygon
          points={PENTAGON_POINTS}
          fill="#000000"
          fillOpacity={isDark ? SWEEP_DIM_OPACITY.dark : SWEEP_DIM_OPACITY.light}
        />
        <Polygon points={PENTAGON_POINTS} fill="url(#prismSheen)" />
      </G>
      <Polygon
        points={PENTAGON_POINTS}
        fill="none"
        stroke={boardBackgroundColor}
        strokeWidth={PENTAGON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      {isDark ? null : <PentagonBevel clipId="prismFace" opacity={PRISM_BEVEL} />}
      <PentagonHairline />
    </>
  )
}
