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
import { EDGE_SLIDES, edgeStyle, FIRST_PLAYER_TAB, type FirstPlayerTab } from "./FirstPlayerTabs"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"
import { turnElapsed, turnTimeSpent, type Turn } from "../../convex/lib/turns"

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
  canPass: boolean
  clockStyle: TurnClockStyle
  passStyle: TurnPassStyle
  chessBankMs: number
  roundClock?: RoundClock
  system?: PlaySystemId
  onPress: () => void
  onLongPress: () => void
}

const MARK = 20
const SWAP_MS = 4_000
const TICK_MS = 1_000

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
 * two, so the active seat's own mark and color say whose turn it is. Every copy runs the same
 * action, so screen readers and keyboards get only the first.
 */
export const TurnTabs = memo(function TurnTabs(props: TurnTabProps) {
  const {
    theme: { colors },
  } = useAppTheme()
  const animateFully = useReducedMotion() === false
  const { tabs, seat, turn, onPress, onLongPress } = props
  const now = useNow(turn !== undefined)
  const label = turnTabLabel(props, now)

  return (
    <>
      {tabs.map((tab, index) => {
        const primary = index === 0
        const along = tab.edge === "left" || tab.edge === "right"
        const upright = tab.facing % 180 === 0
        const wide = along ? !upright : upright
        // why: the attached edge has no border, so the press area is one border short there.
        const press = along
          ? {
              width: FIRST_PLAYER_TAB.depth - TAB_BORDER,
              height: FIRST_PLAYER_TAB.length - 2 * TAB_BORDER,
            }
          : {
              width: FIRST_PLAYER_TAB.length - 2 * TAB_BORDER,
              height: FIRST_PLAYER_TAB.depth - TAB_BORDER,
            }
        const inner = upright ? press : { width: press.height, height: press.width }
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
              edgeStyle(tab, FIRST_PLAYER_TAB),
              {
                backgroundColor: colors.gameMenu.anchor,
                borderColor: seat?.color ?? colors.gameMenu.anchorBorder,
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
              style={({ pressed }) => [$press, pressed && $pressed]}
            >
              <View
                style={[
                  $inner,
                  inner,
                  {
                    left: (press.width - inner.width) / 2,
                    top: (press.height - inner.height) / 2,
                    transform: [{ rotate: `${tab.facing}deg` }],
                  },
                ]}
              >
                <TurnTabFace {...props} wide={wide} now={now} />
              </View>
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
  canPass,
  clockStyle,
  passStyle,
  chessBankMs,
  roundClock,
  system,
  wide,
  now,
}: TurnTabProps & { wide: boolean; now: number }) {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const dim: TextStyle = { color: ink, opacity: 0.62 }
  const direction: ViewStyle = wide ? $row : $column

  if (!turn || !seat)
    return (
      <View style={[$face, direction]}>
        <StartGlyph color={ink} />
        <Text size="xxs" weight="semiBold" style={{ color: ink }} tx="board:turn.whoFirst" />
      </View>
    )

  const round = roundClock ? roundClockText(roundClockView(roundClock, system, now)) : undefined
  const turnTime = formatElapsed(turnElapsed(turn, now))
  const bankLeft = chessBankMs - turnTimeSpent(turn, seat.playerId, now)
  const swapToRound = round !== undefined && Math.floor(now / SWAP_MS) % 2 === 1

  const mark =
    clockStyle === "ring" ? (
      <RingMark seat={seat} fraction={ringFraction(turn, roundClock, system, now)} ink={ink} />
    ) : (
      <PlayerMark seatNumber={seat.seatNumber} shape={seat.shape} color={seat.color} size={MARK} />
    )

  const time =
    clockStyle === "chess" ? (
      <Text
        size="xxs"
        weight="semiBold"
        testID="turn-tab-bank"
        style={[$digits, { color: bankLeft < 0 ? colors.error : ink }]}
        text={`${bankLeft < 0 ? "−" : ""}${formatElapsed(Math.abs(bankLeft))}`}
      />
    ) : clockStyle === "swap" && swapToRound ? (
      <View style={wide ? $inline : $texts}>
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
    clockStyle === "stacked" && round ? (
      <Text size="xxs" style={[$digits, $small, dim]} testID="turn-tab-round" text={round} />
    ) : clockStyle === "chess" ? (
      <Text size="xxs" style={[$digits, $small, dim]} text={turnTime} />
    ) : clockStyle === "ring" && round ? (
      <Text size="xxs" style={[$digits, $small, dim]} text={round} />
    ) : null

  const pass = canPass ? (
    passStyle === "label" ? (
      <Text size="xxs" weight="semiBold" style={[$small, dim]} tx="board:turn.pass" />
    ) : (
      <PassGlyph color={ink} />
    )
  ) : null

  return (
    <View style={[$face, direction]}>
      {mark}
      <View style={wide ? $textsWide : $texts}>
        {time}
        {second}
        {passStyle === "label" ? pass : null}
      </View>
      {passStyle === "icon" ? pass : null}
    </View>
  )
}

function turnTabLabel({ turn, seat, canPass, roundClock, system }: TurnTabProps, now: number) {
  if (!turn || !seat) return translate("board:turn.whoFirstLabel")
  const parts = [
    translate("board:turn.label", { number: turn.number, name: seat.name }),
    formatElapsed(turnElapsed(turn, now)),
    roundClock
      ? translate("board:turn.roundLabel", {
          time: roundClockText(roundClockView(roundClock, system, now)),
        })
      : undefined,
    canPass ? translate("board:turn.passHint") : undefined,
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

const RING = 26
const RING_WIDTH = 2

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
        <PlayerMark seatNumber={seat.seatNumber} shape={seat.shape} color={seat.color} size={16} />
      </View>
    </View>
  )
}

function PassGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" testID="turn-tab-pass-icon">
      <Path
        d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
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
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M8 5.5v13l10-6.5z" fill={color} />
    </Svg>
  )
}

const TAB_BORDER = 3
const $tab: ViewStyle = { position: "absolute", borderWidth: TAB_BORDER, overflow: "hidden" }
const $press: ViewStyle = { flex: 1 }
const $pressed: ViewStyle = { opacity: 0.72 }
const $inner: ViewStyle = { position: "absolute", alignItems: "center", justifyContent: "center" }
const $face: ViewStyle = { alignItems: "center", justifyContent: "center", gap: 3 }
const $row: ViewStyle = { flexDirection: "row", gap: 5 }
const $column: ViewStyle = { flexDirection: "column", gap: 2 }
const $texts: ViewStyle = { alignItems: "center" }
const $textsWide: ViewStyle = { alignItems: "flex-start" }
const $inline: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 2 }
const $digits: TextStyle = { fontVariant: ["tabular-nums"], lineHeight: 13 }
const $small: TextStyle = { fontSize: 9, lineHeight: 11 }
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
