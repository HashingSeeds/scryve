import { createContext, memo, useContext, useEffect, useReducer, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import Svg, { Circle, Path } from "react-native-svg"

import type { PlaySystemId } from "@/features/game/playSystems"
import { roundClockText, roundClockView, type RoundClock } from "@/features/game/roundClock"
import type { TurnClockStyle, TurnPassStyle, TurnStyle } from "@/features/game/turnTab"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { accessibleForeground } from "@/utils/colorContrast"
import { formatElapsed } from "@/utils/useElapsedSince"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import {
  EDGE_SLIDES,
  edgeStyle,
  TURN_TAB_BORDER,
  TURN_TAB_FACE_WIDTH,
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
  dense?: boolean
  variant?: TurnStyle
  onPress: () => void
  onLongPress: () => void
}

const PAD_X = 5
const PAD_Y = 4
const GAP = 2
const TIME_ROW = 15
const SMALL_ROW = 11
const SWAP_MS = 4_000
const HOLD_MS = 600
const TICK_MS = 1_000

/**
 * why: the face's long side runs into the board whenever it turns toward seats at the sides,
 * so along the edge the tab is no longer than the first-player tab and the names beside it keep
 * their room. It reaches only as deep as its rows need, so a dense table's narrow seats keep theirs.
 */
export function turnTabSize(
  { edge, facing }: Pick<FirstPlayerTab, "edge" | "facing">,
  faceHeight: number,
) {
  const alongSide = edge === "left" || edge === "right"
  const upright = facing % 180 === 0
  return alongSide === upright
    ? { length: faceHeight + 2 * TURN_TAB_BORDER, depth: TURN_TAB_FACE_WIDTH + TURN_TAB_BORDER }
    : { length: TURN_TAB_FACE_WIDTH + 2 * TURN_TAB_BORDER, depth: faceHeight + TURN_TAB_BORDER }
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
  const { tabs, turn, onPress, onLongPress, variant = "tab", nextSeat } = props
  const holds = variant === "hold" && turn !== undefined && props.canPass
  const held = useSharedValue(0)
  const now = useNow(turn !== undefined)
  const label = turnTabLabel(props, now)
  const ink = colors.gameMenu.anchorGlyph
  const { rows, gap } = useFaceRows(props, now)
  const faceHeight =
    2 * PAD_Y +
    rows.reduce((total, row) => total + row.height, 0) +
    gap * Math.max(0, rows.length - 1)

  return (
    <>
      {tabs.map((tab, index) => {
        const primary = index === 0
        const size = turnTabSize(tab, faceHeight)
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
              accessibilityHint={translate(
                holds ? "board:turn.tapHint" : "board:turn.longPressHint",
              )}
              onPress={holds ? onLongPress : onPress}
              onLongPress={
                holds
                  ? () => {
                      held.value = 0
                      onPress()
                    }
                  : onLongPress
              }
              delayLongPress={holds ? HOLD_MS : 450}
              onPressIn={
                holds ? () => (held.value = withTiming(1, { duration: HOLD_MS })) : undefined
              }
              onPressOut={holds ? () => (held.value = withTiming(0, { duration: 150 })) : undefined}
              style={({ pressed }) => [$press, pressed && { backgroundColor: `${ink}2E` }]}
            >
              {({ pressed }) => (
                <>
                  {holds ? (
                    <HoldFill progress={held} edge={tab.edge} color={nextSeat?.color ?? ink} />
                  ) : null}
                  <View
                    style={[
                      $face,
                      {
                        height: faceHeight,
                        gap,
                        left: (press.width - TURN_TAB_FACE_WIDTH) / 2,
                        top: (press.height - faceHeight) / 2,
                        transform: [{ rotate: `${tab.facing}deg` }, { scale: pressed ? 0.92 : 1 }],
                      },
                    ]}
                  >
                    {rows.map((row) => (
                      <View key={row.key} style={[$row, { height: row.height }]}>
                        {row.node}
                      </View>
                    ))}
                  </View>
                </>
              )}
            </BoardPressable>
          </Animated.View>
        )
      })}
    </>
  )
})

interface FaceRow {
  key: string
  height: number
  node: ReactNode
}

/** why: the tab's depth follows these rows, so a row only exists when it has something to say. */
function useFaceRows(
  {
    turn,
    seat,
    nextSeat,
    canPass,
    clockStyle,
    passStyle,
    roundClock,
    system,
    dense,
    variant = "tab",
  }: TurnTabProps,
  now: number,
): { rows: FaceRow[]; gap: number } {
  const {
    theme: { colors },
  } = useAppTheme()
  const ink = colors.gameMenu.anchorGlyph
  const dim: TextStyle = { color: ink, opacity: 0.62 }
  if (!turn || !seat)
    return {
      gap: GAP,
      rows: [
        { key: "start", height: 16, node: <StartGlyph color={ink} /> },
        {
          key: "first",
          height: 14,
          node: (
            <Text size="xxs" weight="semiBold" style={{ color: ink }} tx="board:turn.whoFirst" />
          ),
        },
      ],
    }

  const round = roundClock ? roundClockText(roundClockView(roundClock, system, now)) : undefined
  const turnTime = formatElapsed(turnElapsed(turn, now))
  const bank = clockStyle === "chess" ? bankLeft(turn, seat.playerId, now) : undefined
  const swapToRound =
    clockStyle === "swap" && round !== undefined && Math.floor(now / SWAP_MS) % 2 === 1
  const second =
    bank !== undefined
      ? turnTime
      : clockStyle === "stacked" || clockStyle === "ring"
        ? round
        : undefined
  const showsNext = canPass && passStyle === "next" && nextSeat !== undefined
  const showsWord = canPass && passStyle === "label"
  // why: with a second clock line and a pass cue the face has four rows; its tiles step down so the tab stays clear of the seats' own controls.
  const compact = dense || (second !== undefined && (showsNext || showsWord))
  const tile = compact ? 24 : 28
  const gap = compact ? 1 : GAP
  const rows: FaceRow[] = []
  const spotlight = variant === "spotlight"

  if (!spotlight)
    rows.push(
      clockStyle === "ring"
        ? {
            key: "mark",
            height: tile + 4,
            node: (
              <RingMark
                seat={seat}
                size={tile + 4}
                fraction={ringFraction(turn, roundClock, system, now)}
                ink={ink}
              />
            ),
          }
        : { key: "mark", height: tile, node: <SeatTile seat={seat} size={tile} /> },
    )

  if (bank !== undefined && bank <= 0)
    rows.push({
      key: "time",
      height: TIME_ROW,
      node: (
        <View testID="turn-tab-out-of-time" style={[$chip, { backgroundColor: colors.error }]}>
          <Text
            size="xxs"
            weight="bold"
            style={[$digits, { color: colors.board.text }]}
            text={formatElapsed(0)}
          />
        </View>
      ),
    })
  else if (swapToRound)
    rows.push({
      key: "time",
      height: TIME_ROW + 9,
      node: (
        <View style={$column}>
          <ClockGlyph color={ink} />
          <Text size="xxs" weight="semiBold" style={[$digits, { color: ink }]} text={round} />
        </View>
      ),
    })
  else
    rows.push({
      key: "time",
      height: TIME_ROW,
      node: (
        <Text
          size="xxs"
          weight="semiBold"
          testID={bank === undefined ? "turn-tab-time" : "turn-tab-bank"}
          style={[$digits, { color: ink }]}
          text={bank === undefined ? turnTime : formatElapsed(bank)}
        />
      ),
    })

  if (second)
    rows.push({
      key: "second",
      height: SMALL_ROW,
      node: (
        <Text size="xxs" style={[$digits, $small, dim]} testID="turn-tab-round" text={second} />
      ),
    })

  if (showsNext && !spotlight) {
    const nextTile = compact ? 16 : 18
    rows.push({
      key: "next",
      height: nextTile,
      node: (
        <View testID="turn-tab-next" style={$nextRow}>
          <NextGlyph color={ink} />
          <SeatTile seat={nextSeat} size={nextTile} />
        </View>
      ),
    })
  }

  if (showsWord && !spotlight)
    rows.push({
      key: "pass",
      height: SMALL_ROW,
      node: (
        <Text
          size="xxs"
          weight="semiBold"
          testID="turn-tab-pass-label"
          style={[$small, dim]}
          tx="board:turn.pass"
        />
      ),
    })

  return { rows, gap }
}

/** why: prototype. a hold fills the tab with the next seat's color from the board's edge, so a pass reads as handing the turn on. */
function HoldFill({
  progress,
  edge,
  color,
}: {
  progress: { value: number }
  edge: FirstPlayerTab["edge"]
  color: string
}) {
  const alongSide = edge === "left" || edge === "right"
  const style = useAnimatedStyle(() =>
    alongSide
      ? { transform: [{ scaleX: progress.value }] }
      : { transform: [{ scaleY: progress.value }] },
  )
  return (
    <Animated.View
      pointerEvents="none"
      style={[$holdFill, { backgroundColor: color, transformOrigin: edge }, style]}
    />
  )
}

/** why: prototype. which seats Spotlight frames, read by each seat on the board. */
export const TurnSpotlightContext = createContext<{ active?: string; next?: string } | undefined>(
  undefined,
)

/** why: prototype. the active seat's card gets a bright frame and the next one a faint dashed one, so the board itself shows the turn. */
export function SeatSpotlight({ playerId }: { playerId: string }) {
  const spotlight = useContext(TurnSpotlightContext)
  const {
    theme: { colors },
  } = useAppTheme()
  const active = spotlight?.active === playerId
  const next = spotlight?.next === playerId
  if (!active && !next) return null
  return (
    <View
      pointerEvents="none"
      testID={active ? "seat-spotlight-active" : "seat-spotlight-next"}
      style={[
        $spotlight,
        active ? $spotlightActive : $spotlightNext,
        { borderColor: colors.gameMenu.anchorGlyph },
      ]}
    />
  )
}

function turnTabLabel(
  { turn, seat, nextSeat, canPass, roundClock, system, variant }: TurnTabProps,
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
        ? translate(variant === "hold" ? "board:turn.holdHintTo" : "board:turn.passHintTo", {
            name: nextSeat.name,
          })
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

const RING_WIDTH = 2.5

function RingMark({
  seat,
  size,
  fraction,
  ink,
}: {
  seat: TurnTabSeat
  size: number
  fraction: number
  ink: string
}) {
  const center = size / 2
  const radius = center - RING_WIDTH / 2
  const angle = 2 * Math.PI * Math.min(Math.max(fraction, 0), 0.9999)
  const x = center + radius * Math.sin(angle)
  const y = center - radius * Math.cos(angle)
  const large = angle > Math.PI ? 1 : 0
  return (
    <View style={{ width: size, height: size }} testID="turn-tab-ring">
      <Svg width={size} height={size} style={$fill}>
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
        <SeatTile seat={seat} size={size - 8} round />
      </View>
    </View>
  )
}

/**
 * why: a seat's mark on its own color, the way the board draws every seat, so a dark seat color
 * still reads against the dark tab and the tile says "that seat" at a glance.
 */
function SeatTile({ seat, size, round }: { seat: TurnTabSeat; size: number; round?: boolean }) {
  return (
    <View
      style={[
        $tile,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : Math.round(size * 0.26),
          backgroundColor: seat.color,
        },
      ]}
    >
      <PlayerMark
        seatNumber={seat.seatNumber}
        shape={seat.shape}
        color={accessibleForeground(seat.color)}
        size={Math.round(size * 0.74)}
      />
    </View>
  )
}

function NextGlyph({ color }: { color: string }) {
  return (
    <Svg width={7} height={10} viewBox="0 0 7 10">
      <Path
        d="M1.5 1.5 5 5l-3.5 3.5"
        stroke={color}
        strokeOpacity={0.62}
        strokeWidth={1.8}
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
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M8 5.5v13l10-6.5z" fill={color} />
    </Svg>
  )
}

const $holdFill: ViewStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  opacity: 0.9,
}
const $spotlight: ViewStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  borderRadius: 24,
}
const $spotlightActive: ViewStyle = { borderWidth: 4 }
const $spotlightNext: ViewStyle = { borderWidth: 2, opacity: 0.5, borderStyle: "dashed" }
const $tab: ViewStyle = { position: "absolute", borderWidth: TURN_TAB_BORDER, overflow: "hidden" }
const $press: ViewStyle = { flex: 1 }
const $face: ViewStyle = {
  position: "absolute",
  width: TURN_TAB_FACE_WIDTH,
  paddingHorizontal: PAD_X,
  paddingVertical: PAD_Y,
  alignItems: "center",
}
const $row: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $tile: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $column: ViewStyle = { alignItems: "center" }
const $nextRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 2 }
const $chip: ViewStyle = {
  borderRadius: 4,
  paddingHorizontal: 4,
  height: TIME_ROW,
  justifyContent: "center",
}
const $digits: TextStyle = { fontVariant: ["tabular-nums"], lineHeight: 14 }
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
