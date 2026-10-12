import { useEffect, useMemo, useState, type ReactElement } from "react"
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
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

interface Point {
  x: number
  y: number
}

// why: a corner is a quadratic curve that starts `enter` along the previous edge, bends through the sharp `tip`, and leaves at `exit` along the next edge.
interface SoftCorner {
  enter: Point
  tip: Point
  exit: Point
}

function formatPoint({ x, y }: Point): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`
}

function towards(from: Point, to: Point, share: number): Point {
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
}

export function buildSoftCorners(input: {
  sides: number
  center: number
  radius: number
  cornerRadius: number
}): SoftCorner[] {
  const pointingUp = -Math.PI / 2
  const tips = Array.from({ length: input.sides }, (_, corner) => {
    const angle = pointingUp + (Math.PI * 2 * corner) / input.sides
    return {
      x: input.center + input.radius * Math.cos(angle),
      y: input.center + input.radius * Math.sin(angle),
    }
  })
  const sideLength = 2 * input.radius * Math.sin(Math.PI / input.sides)
  // why: two corners share each side, so neither may take more than just under half of it.
  const share = Math.min(input.cornerRadius / sideLength, 0.45)
  return tips.map((tip, corner) => ({
    enter: towards(tip, tips[(corner + input.sides - 1) % input.sides], share),
    tip,
    exit: towards(tip, tips[(corner + 1) % input.sides], share),
  }))
}

function pathThrough(corners: readonly SoftCorner[]): string {
  return corners
    .map(
      (corner, index) =>
        `${index === 0 ? "M" : "L"}${formatPoint(corner.enter)} Q${formatPoint(corner.tip)} ${formatPoint(corner.exit)}`,
    )
    .join(" ")
}

export function buildSoftPolygonPath(corners: readonly SoftCorner[]): string {
  return `${pathThrough(corners)} Z`
}

// why: the dashed trace must fit the outline exactly, so measure the curves instead of assuming straight sides.
export function softPolygonLength(corners: readonly SoftCorner[]): number {
  const curveSteps = 24
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  return corners.reduce((total, corner, index) => {
    const next = corners[(index + 1) % corners.length]
    let curve = 0
    let previous = corner.enter
    for (let step = 1; step <= curveSteps; step++) {
      const t = step / curveSteps
      const along = (a: number, b: number, c: number) =>
        (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c
      const point = {
        x: along(corner.enter.x, corner.tip.x, corner.exit.x),
        y: along(corner.enter.y, corner.tip.y, corner.exit.y),
      }
      curve += distance(previous, point)
      previous = point
    }
    return total + curve + distance(corner.exit, next.enter)
  }, 0)
}

// why: about 7pt on the 80pt button, enough to match the app's rounded surfaces without losing the pentagon read.
const PENTAGON_CORNER_RADIUS = 9
// why: the face sits inside the border, so its corners tighten a little to keep the border an even thickness.
const FACE_CORNER_RADIUS = PENTAGON_CORNER_RADIUS * 0.9

const PENTAGON_CORNERS = buildSoftCorners({
  sides: PENTAGON_SIDES,
  center: PENTAGON_CENTER,
  radius: PENTAGON_RADIUS,
  cornerRadius: PENTAGON_CORNER_RADIUS,
})
const PENTAGON_PATH = buildSoftPolygonPath(PENTAGON_CORNERS)

const FACE_RADIUS = PENTAGON_RADIUS - PENTAGON_STROKE_WIDTH / 2

const FACE_CORNERS = buildSoftCorners({
  sides: PENTAGON_SIDES,
  center: PENTAGON_CENTER,
  radius: FACE_RADIUS,
  cornerRadius: FACE_CORNER_RADIUS,
})
const FACE_PATH = buildSoftPolygonPath(FACE_CORNERS)

// why: corners are numbered clockwise from the apex. The open path ends halfway round its first and last curves, so a bevel starts and stops where the sharp version did instead of bulging into a neighboring edge.
function faceEdgePath(corners: readonly number[]): string {
  const [first, ...rest] = corners.map((corner) => FACE_CORNERS[corner])
  const last = rest.pop()!
  const apexOf = (corner: SoftCorner) =>
    towards(towards(corner.enter, corner.tip, 0.5), towards(corner.tip, corner.exit, 0.5), 0.5)
  const halfway = (a: Point, b: Point) => formatPoint(towards(a, b, 0.5))
  return [
    `M${formatPoint(apexOf(first))} Q${halfway(first.tip, first.exit)} ${formatPoint(first.exit)}`,
    pathThrough(rest).replace(/^M/, "L"),
    `L${formatPoint(last.enter)} Q${halfway(last.enter, last.tip)} ${formatPoint(apexOf(last))}`,
  ].join(" ")
}
const EDGES_FACING_AN_UPPER_LEFT_LIGHT = faceEdgePath([3, 4, 0])
const EDGES_FACING_AWAY_FROM_AN_UPPER_LEFT_LIGHT = faceEdgePath([1, 2, 3])

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
    <G testID="game-menu-bevel" clipPath={`url(#${clipId})`}>
      <Path
        d={EDGES_FACING_AWAY_FROM_AN_UPPER_LEFT_LIGHT}
        fill="none"
        stroke="#000000"
        strokeOpacity={opacity.shade}
        strokeWidth={BEVEL_SHADE_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <Path
        d={EDGES_FACING_AN_UPPER_LEFT_LIGHT}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={opacity.light}
        strokeWidth={BEVEL_LIGHT_STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </G>
  )
}

function PentagonHairline({ color }: { color: string }): ReactElement {
  return (
    <Path
      d={FACE_PATH}
      fill="none"
      stroke={color}
      strokeOpacity={0.22}
      strokeWidth={HAIRLINE_STROKE_WIDTH}
      strokeLinejoin="round"
    />
  )
}

const AnimatedPath = Animated.createAnimatedComponent(Path)

const PENTAGON_PERIMETER = softPolygonLength(PENTAGON_CORNERS)
const TRACE_LENGTH = PENTAGON_PERIMETER / PENTAGON_SIDES
const TRACE_LAP_MS = 1400
const RING_FADE_MS = 250
// why: Reanimated reads the system setting only at startup, so animations we already gate on the live preference must not consult it again.
const GATED_MOTION = ReduceMotion.Never
// why: eight dashes per side divide the outline evenly, so no corner gets a doubled dash.
const STILL_TRACE_DASH = TRACE_LENGTH / 8
// why: narrower than the border it covers, so a board-colored edge keeps the ring color apart from the seat colors around the button.
const RING_STROKE_WIDTH = PENTAGON_STROKE_WIDTH - 3

const [{ tip: apex }, { tip: upperRight }] = PENTAGON_CORNERS
// why: 30% of the way from the upper-right corner toward the apex keeps that corner visible, and the point stays on the border when the open menu turns the pentagon. It is past both rounded corners (each takes about 17% of the side), so it sits on the straight edge. The anchor is in fractions of the button size.
const BADGE_SHARE_OF_EDGE = 0.3
export const PENTAGON_BADGE_ANCHOR = {
  x: towards(upperRight, apex, BADGE_SHARE_OF_EDGE).x / PENTAGON_VIEWBOX,
  y: towards(upperRight, apex, BADGE_SHARE_OF_EDGE).y / PENTAGON_VIEWBOX,
} as const

export interface BorderSignal {
  color: string
  motion: "ring" | "trace"
}

function SignalBorder({
  signal,
  animate,
}: {
  signal?: BorderSignal
  animate: boolean
}): ReactElement {
  const trace = signal?.motion === "trace" ? signal.color : undefined
  return (
    <>
      <SignalRing color={signal?.motion === "ring" ? signal.color : undefined} animate={animate} />
      {trace && animate ? <SignalTrace color={trace} /> : null}
      {trace && !animate ? (
        <Path
          testID="game-menu-signal-trace"
          d={PENTAGON_PATH}
          fill="none"
          stroke={trace}
          strokeWidth={PENTAGON_STROKE_WIDTH}
          strokeDasharray={[STILL_TRACE_DASH, STILL_TRACE_DASH]}
        />
      ) : null}
    </>
  )
}

// why: the ring keeps its last color while fading out, so the fade never snaps to the board color.
function SignalRing({ color, animate }: { color?: string; animate: boolean }) {
  const [shownColor, setShownColor] = useState(color)
  if (color && color !== shownColor) setShownColor(color)
  const shown = color !== undefined
  const opacity = useSharedValue(shown && !animate ? 1 : 0)
  useEffect(() => {
    const target = shown ? 1 : 0
    opacity.value = animate
      ? withTiming(target, { duration: RING_FADE_MS, reduceMotion: GATED_MOTION })
      : target
  }, [animate, opacity, shown])
  const animatedProps = useAnimatedProps(() => ({ strokeOpacity: opacity.value }))
  if (!shownColor) return null
  return (
    <AnimatedPath
      testID="game-menu-signal-ring"
      d={PENTAGON_PATH}
      fill="none"
      stroke={shownColor}
      strokeWidth={RING_STROKE_WIDTH}
      strokeLinejoin="round"
      animatedProps={animatedProps}
    />
  )
}

// why: animated props run on the UI thread, so the trace keeps gliding while taps re-render the board.
function SignalTrace({ color }: { color: string }) {
  const offset = useSharedValue(0)
  useEffect(() => {
    offset.value = withRepeat(
      withTiming(-PENTAGON_PERIMETER, {
        duration: TRACE_LAP_MS,
        easing: Easing.linear,
        reduceMotion: GATED_MOTION,
      }),
      -1,
      false,
      undefined,
      GATED_MOTION,
    )
    return () => cancelAnimation(offset)
  }, [offset])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))
  return (
    <AnimatedPath
      testID="game-menu-signal-trace"
      d={PENTAGON_PATH}
      fill="none"
      stroke={color}
      strokeWidth={PENTAGON_STROKE_WIDTH}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={[TRACE_LENGTH, PENTAGON_PERIMETER - TRACE_LENGTH]}
      animatedProps={animatedProps}
    />
  )
}

export interface GameMenuButtonShapeProps {
  variant: MenuButtonStyle
  isDark: boolean
  boardBackgroundColor: string
  seatColors?: readonly string[]
  signal?: BorderSignal
  // why: off while reduced motion is on or unknown, so rings appear at once and traces hold still as dashes.
  animateSignal?: boolean
}

export function GameMenuButtonShape({
  variant,
  isDark,
  boardBackgroundColor,
  seatColors,
  signal,
  animateSignal = false,
}: GameMenuButtonShapeProps): ReactElement {
  const signalLayer = <SignalBorder signal={signal} animate={animateSignal} />
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
          signalLayer={signalLayer}
        />
      ) : (
        <KeystoneTwoShape
          isDark={isDark}
          boardBackgroundColor={boardBackgroundColor}
          signalLayer={signalLayer}
        />
      )}
    </Svg>
  )
}

function KeystoneTwoShape({
  isDark,
  boardBackgroundColor,
  signalLayer,
}: {
  isDark: boolean
  boardBackgroundColor: string
  signalLayer: ReactElement
}): ReactElement {
  const face = isDark ? KEYSTONE_II_FACE.dark : KEYSTONE_II_FACE.light
  return (
    <>
      <Defs>
        <ClipPath id="keystoneTwoFace">
          <Path d={FACE_PATH} />
        </ClipPath>
        <LinearGradient id="keystoneTwoFill" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor={face.top} />
          <Stop offset="1" stopColor={face.bottom} />
        </LinearGradient>
      </Defs>
      <Path
        d={PENTAGON_PATH}
        fill="url(#keystoneTwoFill)"
        stroke={boardBackgroundColor}
        strokeWidth={PENTAGON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      {signalLayer}
      {isDark ? null : <PentagonBevel clipId="keystoneTwoFace" opacity={KEYSTONE_II_BEVEL} />}
      <PentagonHairline color={boardBackgroundColor} />
    </>
  )
}

function PrismShape({
  isDark,
  boardBackgroundColor,
  seatColors,
  signalLayer,
}: {
  isDark: boolean
  boardBackgroundColor: string
  seatColors?: readonly string[]
  signalLayer: ReactElement
}): ReactElement {
  const palette = seatColors && seatColors.length > 0 ? seatColors : PLAYER_COLORS
  const paletteKey = palette.join("|")
  const wedges = useMemo(() => buildSweepWedges(paletteKey.split("|")), [paletteKey])
  return (
    <>
      <Defs>
        <ClipPath id="prismFace">
          <Path d={FACE_PATH} />
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
        <Path
          d={PENTAGON_PATH}
          fill="#000000"
          fillOpacity={isDark ? SWEEP_DIM_OPACITY.dark : SWEEP_DIM_OPACITY.light}
        />
        <Path d={PENTAGON_PATH} fill="url(#prismSheen)" />
      </G>
      <Path
        d={PENTAGON_PATH}
        fill="none"
        stroke={boardBackgroundColor}
        strokeWidth={PENTAGON_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      {signalLayer}
      {isDark ? null : <PentagonBevel clipId="prismFace" opacity={PRISM_BEVEL} />}
      <PentagonHairline color={boardBackgroundColor} />
    </>
  )
}
