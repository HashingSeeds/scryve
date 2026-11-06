import { memo, useEffect, useReducer } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated from "react-native-reanimated"
import Svg, { Circle, Path } from "react-native-svg"

import type { PlaySystemId } from "@/features/game/playSystems"
import { roundClockText, roundClockView, type RoundClock } from "@/features/game/roundClock"
import type { TurnClockStyle, TurnPassStyle } from "@/features/game/turnTab"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { formatElapsed } from "@/utils/useElapsedSince"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import {
  EDGE_SLIDES,
  edgeStyle,
  TURN_TAB_BORDER,
  TURN_TAB_FACE,
  type FirstPlayerTab,
} from "./FirstPlayerTabs"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"
import { bankLeft, turnElapsed, type Turn } from "../../convex/lib/turns"

export interface TurnTabSeat {
  playerId: string
  seatNumber: number
  name: string
  color: string
  shape?: PlayerMarkShape
}

export interface TurnTabProps {
  tabs: readonly FirstPlayerTab[]
  turn: Turn | undefined
  seat: TurnTabSeat | undefined
  nextSeat?: TurnTabSeat
  canPass: boolean
  clockStyle: TurnClockStyle
  passStyle: TurnPassStyle
  roundClock?: RoundClock
  system?: PlaySystemId
  onPress: () => void
  onLongPress: () => void
}

const PAD_X = 6
const PAD_Y = 4
const MARK = 26
const NEXT_MARK = 13
const SWAP_MS = 4_000
const TICK_MS = 1_000

/**
 * why: the face's long side runs into the board whenever it turns toward seats at the sides,
 * so along the edge the tab is no longer than the first-player tab and the names beside it keep
 * their room. Only the two-seat board, where nothing sits beside the seam, runs it along the edge.
 */
export function turnTabSize({ edge, facing }: Pick<FirstPlayerTab, "edge" | "facing">) {
  const alongSide = edge === "left" || edge === "right"
  const upright = facing % 180 === 0
  const faceRunsAlongEdge = alongSide === upright
  return faceRunsAlongEdge
    ? {
        length: TURN_TAB_FACE.height + 2 * TURN_TAB_BORDER,
        depth: TURN_TAB_FACE.width + TURN_TAB_BORDER,
      }
    : {
        length: TURN_TAB_FACE.width + 2 * TURN_TAB_BORDER,
        depth: TURN_TAB_FACE.height + TURN_TAB_BORDER,
      }
}

/** why: only the tab's text ticks, so the seats never re-render with the clock. */
function useNow(ticking: boolean) {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [ticking])
  return Date.now()
}

/**
 * why: the tab stays where the first-player tab was, at the menu's seam on the board's side
 * edges, and never follows the turn around the table. Arrows only point at a seat when there are
 * two, so the active seat's own mark says whose turn it is; the border stays the board's, so a
 * seat color never sits against two other seats' colors. Every copy runs the same action, so
 * screen readers and keyboards get only the first.
 */
export const TurnTabs = memo(function TurnTabs(props: TurnTabProps) {
  const {
    theme: { colors },
  } = useAppTheme()
  const animateFully = useReducedMotion() === false
  const { tabs, turn, onPress, onLongPress } = props
  const now = useNow(turn !== undefined)
  const label = turnTabLabel(props, now)
  const ink = colors.gameMenu.anchorGlyph

  return (
    <>
      {tabs.map((tab, index) => {
        const primary = index === 0
        const size = turnTabSize(tab)
        const alongSide = tab.edge === "left" || tab.edge === "right"
        const box = alongSide
          ? { width: size.depth, height: size.length }
          : { width: size.length, height: size.depth }
        const press = {
          width: box.width - (alongSide ? 1 : 2) * TURN_TAB_BORDER,
          height: box.height - (alongSide ? 2 : 1) * TURN_TAB_BORDER,
        }
        return (
          <Animated.View
            key={`${tab.edge}:${tab.at}`}
            entering={animateFully ? EDGE_SLIDES[tab.edge].entering : undefined}
            exiting={animateFully ? EDGE_SLIDES[tab.edge].exiting : undefined}
            aria-hidden={!primary}
            accessibilityElementsHidden={!primary}
            importantForAccessibility={primary ? "auto" : "no-hide-descendants"}
            style={[
              $tab,
              edgeStyle(tab, size),
              {
                backgroundColor: colors.gameMenu.anchor,
                borderColor: colors.gameMenu.anchorBorder,
              },
            ]}
          >
            <BoardPressable
              testID={primary ? "turn-tab" : "turn-tab-mirror"}
              tabIndex={primary ? undefined : -1}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={translate("board:turn.longPressHint")}
              onPress={onPress}
              onLongPress={onLongPress}
              delayLongPress={450}
              style={({ pressed }) => [$press, pressed && { backgroundColor: `${ink}2E` }]}
            >
              {({ pressed }) => (
                <View
                  style={[
                    $face,
                    {
                      left: (press.width - TURN_TAB_FACE.width) / 2,
                      top: (press.height - TURN_TAB_FACE.height) / 2,
                      transform: [{ rotate: `${tab.facing}deg` }, { scale: pressed ? 0.92 : 1 }],
                    },
                  ]}
                >
                  <TurnTabFace {...props} now={now} />
                </View>
              )}
            </BoardPressable>
          </Animated.View>
        )
      })}
    </>
  )
})

function TurnTabFace({
  turn,
  seat,
  nextSeat,
  canPass,
  clockStyle,
  passStyle,
  roundClock,
  system,
  now,
}: TurnTabProps & { now: number }) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const dim: TextStyle = { color: ink, opacity: 0.62 }

  if (!turn || !seat)
    return (
      <>
        <StartGlyph color={ink} />
        <Text size="xxs" weight="semiBold" style={{ color: ink }} tx="board:turn.whoFirst" />
      </>
    )

  const round = roundClock ? roundClockText(roundClockView(roundClock, system, now)) : undefined
  const turnTime = formatElapsed(turnElapsed(turn, now))
  const bank = bankLeft(turn, seat.playerId, now)
  const swapToRound = round !== undefined && Math.floor(now / SWAP_MS) % 2 === 1
  const showsNext = canPass && passStyle === "next" && nextSeat !== undefined

  const markView =
    clockStyle === "ring" ? (
      <RingMark seat={seat} fraction={ringFraction(turn, roundClock, system, now)} ink={ink} />
    ) : (
      <PlayerMark seatNumber={seat.seatNumber} shape={seat.shape} color={seat.color} size={MARK} />
    )

  const time =
    clockStyle === "chess" && bank !== undefined ? (
      bank > 0 ? (
        <Text
          size="xxs"
          weight="semiBold"
          testID="turn-tab-bank"
          style={[$digits, { color: ink }]}
          text={formatElapsed(bank)}
        />
      ) : (
        <Text
          size="xxs"
          weight="bold"
          testID="turn-tab-out-of-time"
          numberOfLines={2}
          style={[$small, $center, { color: colors.error }]}
          tx="board:turn.outOfTime"
        />
      )
    ) : clockStyle === "swap" && swapToRound ? (
      <View style={$column}>
        <ClockGlyph color={ink} />
        <Text size="xxs" weight="semiBold" style={[$digits, { color: ink }]} text={round} />
      </View>
    ) : (
      <Text
        size="xxs"
        weight="semiBold"
        testID="turn-tab-time"
        style={[$digits, { color: ink }]}
        text={turnTime}
      />
    )

  const second =
    (clockStyle === "stacked" || clockStyle === "ring") && round ? (
      <Text size="xxs" style={[$digits, $small, dim]} testID="turn-tab-round" text={round} />
    ) : clockStyle === "chess" && bank !== undefined ? (
      <Text size="xxs" style={[$digits, $small, dim]} text={turnTime} />
    ) : null

  return (
    <>
      <View>
        {markView}
        {showsNext ? (
          <View testID="turn-tab-next" style={[$next, { backgroundColor: colors.gameMenu.anchor }]}>
            <PlayerMark
              seatNumber={nextSeat.seatNumber}
              shape={nextSeat.shape}
              color={nextSeat.color}
              size={NEXT_MARK}
            />
          </View>
        ) : null}
      </View>
      {time}
      {second}
      {canPass && passStyle === "label" ? (
        <Text
          size="xxs"
          weight="semiBold"
          testID="turn-tab-pass-label"
          style={[$small, dim]}
          tx="board:turn.pass"
        />
      ) : null}
    </>
  )
}

function turnTabLabel(
  { turn, seat, nextSeat, canPass, roundClock, system }: TurnTabProps,
  now: number,
) {
  if (!turn || !seat) return translate("board:turn.whoFirstLabel")
  const bank = bankLeft(turn, seat.playerId, now)
  const parts = [
    translate("board:turn.label", { number: turn.number, name: seat.name }),
    formatElapsed(turnElapsed(turn, now)),
    bank === undefined
      ? undefined
      : bank > 0
        ? translate("board:turn.bankLabel", { time: formatElapsed(bank) })
        : translate("board:turn.outOfTime"),
    roundClock
      ? translate("board:turn.roundLabel", {
          time: roundClockText(roundClockView(roundClock, system, now)),
        })
      : undefined,
    canPass
      ? nextSeat
        ? translate("board:turn.passHintTo", { name: nextSeat.name })
        : translate("board:turn.passHint")
      : undefined,
  ]
  return parts.filter(Boolean).join(". ")
}

/** why: a countdown drains the ring toward time; without one the ring sweeps once a minute of the turn, a glanceable sense of how long this turn has run. */
function ringFraction(
  turn: Turn,
  clock: RoundClock | undefined,
  system: PlaySystemId | undefined,
  now: number,
) {
  if (clock?.setup.mode === "countdown") {
    const view = roundClockView(clock, system, now)
    const total = clock.setup.minutes * 60_000 + (clock.adjustMs ?? 0)
    return view.kind === "remaining" && total > 0 ? view.ms / total : 0
  }
  return (turnElapsed(turn, now) % 60_000) / 60_000
}

const RING = 30
const RING_WIDTH = 2.5

function RingMark({ seat, fraction, ink }: { seat: TurnTabSeat; fraction: number; ink: string }) {
  const center = RING / 2
  const radius = center - RING_WIDTH / 2
  const angle = 2 * Math.PI * Math.min(Math.max(fraction, 0), 0.9999)
  const x = center + radius * Math.sin(angle)
  const y = center - radius * Math.cos(angle)
  const large = angle > Math.PI ? 1 : 0
  return (
    <View style={{ width: RING, height: RING }} testID="turn-tab-ring">
      <Svg width={RING} height={RING} style={$fill}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={ink}
          strokeOpacity={0.18}
          strokeWidth={RING_WIDTH}
          fill="none"
        />
        {fraction > 0 ? (
          <Path
            d={`M ${center} ${center - radius} A ${radius} ${radius} 0 ${large} 1 ${x} ${y}`}
            stroke={seat.color}
            strokeWidth={RING_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </Svg>
      <View style={$ringMark}>
        <PlayerMark seatNumber={seat.seatNumber} shape={seat.shape} color={seat.color} size={21} />
      </View>
    </View>
  )
}

function ClockGlyph({ color }: { color: string }) {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={3} fill="none" />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

function StartGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M8 5.5v13l10-6.5z" fill={color} />
    </Svg>
  )
}

const $tab: ViewStyle = { position: "absolute", borderWidth: TURN_TAB_BORDER, overflow: "hidden" }
const $press: ViewStyle = { flex: 1 }
const $face: ViewStyle = {
  position: "absolute",
  width: TURN_TAB_FACE.width,
  height: TURN_TAB_FACE.height,
  paddingHorizontal: PAD_X,
  paddingVertical: PAD_Y,
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
}
const $column: ViewStyle = { alignItems: "center" }
const $next: ViewStyle = {
  position: "absolute",
  right: -7,
  bottom: -4,
  borderRadius: NEXT_MARK,
  padding: 1.5,
}
const $digits: TextStyle = { fontVariant: ["tabular-nums"], lineHeight: 13 }
const $small: TextStyle = { fontSize: 9, lineHeight: 11 }
const $center: TextStyle = { textAlign: "center" }
const $fill: ViewStyle = { position: "absolute", left: 0, top: 0 }
const $ringMark: ViewStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  alignItems: "center",
  justifyContent: "center",
}
