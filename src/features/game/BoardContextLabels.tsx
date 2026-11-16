import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { BoardPressable } from "@/components/BoardPressable"
import { DIGIT_INK_HEIGHT } from "@/components/commanderDamageLayout"
import { seatIdentityPlacement } from "@/components/LifeCard"
import type { LifeCardContentRotation } from "@/components/playerCardTypes"
import { CONTENT_EDGES, EDGE_TAB, type seatFrames } from "@/components/playerGridGeometry"
import { MENU_CLEARANCE } from "@/components/pokemon/pokemonCardLayout"
import { seatIdentityMetrics } from "@/components/SeatIdentity"
import { Text } from "@/components/Text"
import { separator } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { PlaySystemId } from "./playSystems"
import { roundClockText, type RoundClock, type RoundClockView } from "./roundClock"
import { useRoundClockView } from "./useRoundClockView"

const WARN_MS = 5 * 60_000

const LINE_HEIGHT = 18
const IDENTITY_CLEARANCE = 4
const TOP_GAP = 6
const TURNS: readonly LifeCardContentRotation[] = [0, 90, 180, -90]

type SeatRows = ReturnType<typeof seatFrames>["rows"]
type Seat = NonNullable<SeatRows[number][number]>
type Point = { x: number; y: number }

interface LabelInput {
  rows: SeatRows
  board: { width: number; height: number }
  screen?: { width: number; height: number }
  rotation?: number
  compact?: boolean
  benchSeats?: boolean
  lifeFontSize?: number
}

export type ContextLabelPlacement = ReturnType<typeof contextLabelPlacements>[number]

function turned({ x, y }: Point, degrees: number): Point {
  const turn = (degrees * Math.PI) / 180
  const cos = Math.round(Math.cos(turn))
  const sin = Math.round(Math.sin(turn))
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** why: a seat's free strip depends on what it draws. The life total reaches a short seat's identity row, so the line takes the strip along the seat's top edge. Where the menu holds the middle of that edge it sits above the identity row if the total leaves room, else in the strip the seat keeps clear beside the menu. A bench seat is full from its identity row to its top edge, so that strip is its only free one. Measured in the seat's own upright frame: `along` from its left, `up` from its foot. */
function seatSpot(
  seat: Seat,
  {
    compact,
    benchSeats,
    lifeFontSize = 0,
  }: Pick<LabelInput, "compact" | "benchSeats" | "lifeFontSize">,
) {
  const { card, rotation, contentInsets, screenEdges } = seat
  const sideways = Math.abs(rotation) === 90
  const run = sideways ? card.height : card.width
  const rise = sideways ? card.width : card.height
  const edges = CONTENT_EDGES[rotation]
  if (seat.menuEdgeCenter !== edges.top)
    return benchSeats
      ? undefined
      : {
          along: run / 2,
          up: rise - contentInsets[edges.top] - TOP_GAP - LINE_HEIGHT / 2,
          width: run,
        }
  const { edge, icon } = seatIdentityMetrics(compact)
  const identity = seatIdentityPlacement({
    rotation,
    cardSize: card,
    gap: edge,
    insets: contentInsets,
    screenEdges,
    markHeight: icon,
    buttonSize: icon,
  })
  const foot = Number(identity.position.bottom) + icon + IDENTITY_CLEARANCE
  const lifeFoot =
    (rise +
      contentInsets[edges.bottom] -
      contentInsets[edges.top] -
      DIGIT_INK_HEIGHT * lifeFontSize) /
    2
  if (!benchSeats && foot + LINE_HEIGHT <= lifeFoot)
    return { along: run / 2, up: foot + LINE_HEIGHT / 2, width: run }
  const start = Math.max(EDGE_TAB.depth, contentInsets[edges.left])
  const end = run / 2 - MENU_CLEARANCE
  return end > start
    ? { along: (start + end) / 2, up: rise - MENU_CLEARANCE / 2, width: end - start }
    : undefined
}

/** why: a line centred on a whole screen edge crossed the dividers of a board with more than two seats and drew over a bench, so each copy sits inside one seat, turned to face it. One copy per facing is enough to read from every side; it goes in the seat nearest the middle of the table. `rotation` turns a board drawn sideways onto the screen. */
export function contextLabelPlacements({
  rows,
  board,
  screen = board,
  rotation = 0,
  compact,
  benchSeats,
  lifeFontSize,
}: LabelInput) {
  const nearest = new Map<LifeCardContentRotation, { center: Point; width: number; far: number }>()
  for (const seat of rows.flat()) {
    const spot = seat && seatSpot(seat, { compact, benchSeats, lifeFontSize })
    if (!spot) continue
    const { card } = seat
    const sideways = Math.abs(seat.rotation) === 90
    const middle = { x: card.x + card.width / 2, y: card.y + card.height / 2 }
    const offset = turned(
      {
        x: spot.along - (sideways ? card.height : card.width) / 2,
        y: (sideways ? card.width : card.height) / 2 - spot.up,
      },
      seat.rotation,
    )
    const far = Math.hypot(middle.x - board.width / 2, middle.y - board.height / 2)
    const current = nearest.get(seat.rotation)
    if (current && far > current.far - 0.5) continue
    nearest.set(seat.rotation, {
      center: { x: middle.x + offset.x, y: middle.y + offset.y },
      width: spot.width,
      far,
    })
  }
  return [...nearest].map(([facing, { center, width }]) => {
    const onScreen = turned(
      { x: center.x - board.width / 2, y: center.y - board.height / 2 },
      rotation,
    )
    return {
      left: screen.width / 2 + onScreen.x - width / 2,
      top: screen.height / 2 + onScreen.y - LINE_HEIGHT / 2,
      width,
      turn: TURNS[((((facing + rotation) / 90) % 4) + 4) % 4],
    }
  })
}

export interface BoardContextLabelsProps {
  match?: { line: string; accessibilityLabel: string }
  clock?: RoundClock
  system?: PlaySystemId
  placements: readonly ContextLabelPlacement[]
  onClockPress?: () => void
}

/** why: each copy is turned to face the players on its side of the table, only the last is read out, and the line ticks on its own so the seats never re-render with the clock. */
export function BoardContextLabels({
  match,
  clock,
  system,
  placements,
  onClockPress,
}: BoardContextLabelsProps) {
  const view = useRoundClockView(clock, system)
  const paused = clock?.pausedAt !== undefined
  const pointerEvents = onClockPress ? "box-none" : "none"
  return (
    <>
      {placements.map(({ turn, ...frame }, index) => {
        const hidden = index < placements.length - 1
        return (
          <View
            key={turn}
            pointerEvents={pointerEvents}
            style={[$layer, frame, { transform: [{ rotate: `${turn}deg` }] }]}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
            aria-hidden={hidden}
          >
            <ContextLine
              testID={hidden ? "match-context-top" : "match-context"}
              hidden={hidden}
              match={match}
              view={view}
              paused={paused}
              onPress={onClockPress}
            />
          </View>
        )
      })}
    </>
  )
}

function ContextLine({
  testID,
  hidden = false,
  match,
  view,
  paused = false,
  onPress,
}: {
  testID: string
  hidden?: boolean
  match?: BoardContextLabelsProps["match"]
  view?: RoundClockView
  paused?: boolean
  onPress?: () => void
}) {
  const { themed } = useAppTheme()
  const clockText = view ? roundClockText(view) : ""
  // why: seat colors vary, so urgency reads through weight rather than a hue that can vanish on some seats.
  const urgent = view?.kind === "time" || (view?.kind === "remaining" && view.ms <= WARN_MS)
  const line = (
    <Text
      testID={testID}
      size="xxs"
      weight="medium"
      numberOfLines={1}
      accessibilityLabel={[match?.accessibilityLabel, view && clockLabel(view, clockText, paused)]
        .filter(Boolean)
        .join(". ")}
      style={themed([$text, $line])}
    >
      {match?.line}
      {match && view ? separator("common:separator") : null}
      {view?.kind === "time" ? (
        <Text size="xxs" weight="semiBold" style={themed($text)} tx="board:clock.time" />
      ) : null}
      {view?.kind === "time" && clockText ? separator("common:separator") : null}
      {clockText ? (
        <Text size="xxs" weight={urgent ? "semiBold" : "medium"} style={themed($text)}>
          {clockText}
        </Text>
      ) : null}
      {paused ? separator("common:separator") + translate("board:clock.paused") : null}
    </Text>
  )
  if (!onPress) return line
  return (
    <BoardPressable
      testID={`${testID}-button`}
      accessibilityRole="button"
      accessibilityHint={translate("board:clock.opensRoundClock")}
      accessible={!hidden}
      focusable={!hidden}
      hitSlop={12}
      onPress={onPress}
    >
      {line}
    </BoardPressable>
  )
}

function clockLabel(view: RoundClockView, text: string, paused: boolean) {
  if (view.kind === "remaining")
    return translate(paused ? "board:clock.leftPaused" : "board:clock.left", { time: text })
  if (view.kind === "elapsed")
    return translate(paused ? "board:clock.elapsedPaused" : "board:clock.elapsed", { time: text })
  return text ? translate("board:clock.timeWith", { time: text }) : translate("board:clock.time")
}

// why: the line is anchored at its foot, so larger text grows away from the identity row.
const $layer: ViewStyle = {
  position: "absolute",
  height: LINE_HEIGHT,
  zIndex: 60,
  elevation: 60,
  alignItems: "center",
  justifyContent: "flex-end",
}
const $text: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.board.text })
const $line: ThemedStyle<TextStyle> = () => ({ opacity: 0.8 })
