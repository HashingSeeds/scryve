import { useEffect, useReducer, useRef, useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated"
import Svg, { Path } from "react-native-svg"

import type { PriorityChipState, TurnChipState } from "@/features/game/dice"
import { formatNumber } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { formatElapsed } from "@/utils/useElapsedSince"

import { BoardPressable } from "./BoardPressable"
import {
  HANDOFF_MS,
  NAME_OUT_MS,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { CONTENT_EDGES } from "./playerGridLayout"
import { MarkArt } from "./PlayerMark"
import { contentInsetsFor, rotatedLayerStyle } from "./pokemon/pokemonCardLayout"
import { Text } from "./Text"
import { useTurnSpotlight } from "./TurnSpotlight"
import { shapeForSeat } from "../../convex/lib/appearance"
import { bankLeft, turnElapsed } from "../../convex/lib/turns"

const TICK_MS = 1_000
const WHOLE_MINUTES_FROM_MS = 10 * 60_000
/** why: half the largest (80pt) menu pentagon plus an 8pt gap, measured along the edge from the pentagon's center. */
const MENU_HALF_RUN = 48
const EDGE_GAP = 8

function useNow(ticking: boolean) {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [ticking])
  return Date.now()
}

export function turnChipLeft(input: {
  run: number
  width: number
  rotation: LifeCardContentRotation
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
}) {
  const { run, width, rotation, menuCorner, menuEdgeCenter } = input
  const edges = CONTENT_EDGES[rotation]
  const centered = (run - width) / 2
  const clamp = (left: number) => Math.min(Math.max(left, EDGE_GAP), run - width - EDGE_GAP)
  if (menuEdgeCenter === edges.top) return clamp(run / 2 + MENU_HALF_RUN)
  const corner = menuCorner?.toLowerCase()
  if (!corner?.includes(edges.top)) return centered
  return corner.includes(edges.left)
    ? clamp(Math.max(centered, MENU_HALF_RUN))
    : clamp(Math.min(centered, run - MENU_HALF_RUN - width))
}

/** why: a seat without a name row (Pokémon) carries its turn and undo chips on the card's top edge, clear of the menu pentagon. */
export function TurnChipLayer({
  seatNumber,
  rotation,
  cardSize,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  children,
}: {
  seatNumber: number
  children: ReactNode
  rotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
}) {
  const [width, setWidth] = useState(0)
  if (cardSize.width === 0 || cardSize.height === 0) return null
  const run = Math.abs(rotation) === 90 ? cardSize.height : cardSize.width
  const insets = contentInsetsFor(rotation, contentInsets)
  const left = turnChipLeft({ run, width, rotation, menuCorner, menuEdgeCenter })
  return (
    <View
      testID={`turn-chip-layer-seat-${seatNumber}`}
      pointerEvents="box-none"
      style={[$layer, rotatedLayerStyle(rotation, cardSize.width, cardSize.height)]}
    >
      <View
        pointerEvents="box-none"
        onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}
        style={[$slot, { top: EDGE_GAP + insets.top, left }, width === 0 && $measuring]}
      >
        {children}
      </View>
    </View>
  )
}

/** why: the row steps a chip down as room runs out. A count goes "Turn 3 | Pass › mark", "3 › mark", "› mark"; a clock goes "19:57 | Pass › mark", "19:57 ›", "19m ›"; Start goes to just ▶ at its first step, since a step that looks the same never measures again. */
export type TurnChipSize = "full" | "number" | "pass"

export function TurnChip({
  state,
  seatNumber,
  foreground,
  compact,
  size = "full",
}: {
  state: TurnChipState
  seatNumber: number
  foreground: string
  compact?: boolean
  size?: TurnChipSize
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { turn, canPress } = state
  const next = useTurnSpotlight()?.passTo
  // why: without a chess bank the chip counts turns, not time, so it never waits on a clock to start.
  const numbered = !turn.bank
  const waiting = turn.waiting && !numbered
  const paused = !waiting && !numbered && (!!turn.paused || !!turn.priorityPlayerId)
  const ticking = !waiting && !numbered && !paused
  const now = useNow(ticking)
  const bank = bankLeft(turn, turn.playerId, now)
  const outOfTime = bank !== undefined && bank <= 0
  const clockMs = bank === undefined ? turnElapsed(turn, now) : Math.max(0, bank)
  const time = formatElapsed(clockMs)
  // why: a clock can't drop its time like a count drops its number, so its smallest step drops the seconds while ten or more minutes are left.
  const shownTime = numbered
    ? size !== "full"
      ? formatNumber(turn.number)
      : translate("board:turn.chipNumber", { number: turn.number })
    : size === "pass" && clockMs >= WHOLE_MINUTES_FROM_MS
      ? translate("board:turn.chipMinutes", { minutes: Math.floor(clockMs / 60_000) })
      : time
  const ink = outOfTime ? colors.board.text : foreground
  const name = state.nameOf(turn.playerId) ?? ""
  const nextName = next ? state.nameOf(next) : undefined
  const nextSeat = next ? state.seatOf?.(next) : undefined
  const split = !waiting && !outOfTime && !!nextSeat
  const splitButtons = canPress && split && !!nextSeat && !numbered && !!state.onPause
  const passOnly = split && numbered && size === "pass"
  // why: past the full step a clock chip drops the next player's mark; the pass segment's color still says who's next.
  const nextMarkShown = numbered || size === "full"
  const tight = split && !numbered && size === "pass"
  const nextInk = nextSeat ? accessibleForeground(nextSeat.color) : ink
  const label = [
    translate("board:turn.label", { number: turn.number, name }),
    waiting || numbered ? undefined : outOfTime ? translate("board:turn.outOfTime") : time,
    canPress
      ? waiting
        ? translate("board:turn.startHint")
        : nextName
          ? translate("board:turn.passHintTo", { name: nextName })
          : undefined
      : undefined,
  ]
    .filter(Boolean)
    .join(". ")

  const passSegmentContent =
    split && nextSeat ? (
      <>
        {canPress && state.passLabelShown && size === "full" ? (
          <Text
            tx="board:turn.pass"
            weight="semiBold"
            style={[compact ? $compactWord : $word, { color: nextInk }]}
          />
        ) : null}
        <ChevronGlyph color={nextInk} />
        {nextMarkShown ? (
          <MarkArt
            shape={nextSeat.shape ?? shapeForSeat(nextSeat.seatNumber)}
            color={nextInk}
            size={compact ? 18 : 20}
          />
        ) : null}
      </>
    ) : null

  const content = waiting ? (
    <>
      <PlayGlyph color={ink} />
      {size !== "full" ? null : (
        <Text tx="board:turn.start" weight="bold" style={[themed($value), { color: ink }]} />
      )}
    </>
  ) : (
    <>
      {passOnly ? null : (
        <Text
          text={shownTime}
          testID={outOfTime ? "turn-chip-out-of-time" : "turn-chip-time"}
          weight="bold"
          style={[themed(compact ? $compactValue : $value), $digits, { color: ink }]}
        />
      )}
      {split && nextSeat ? (
        <View
          style={[
            $passSegment,
            passOnly && $passSegmentAlone,
            tight && $passSegmentTight,
            { backgroundColor: nextSeat.color },
          ]}
        >
          {passSegmentContent}
        </View>
      ) : null}
    </>
  )

  const shape: ViewStyle[] = [
    compact ? $compactChip : $chip,
    ...(split ? [$split] : []),
    ...(splitButtons ? [$splitButtons] : []),
    ...(passOnly ? [$passOnly] : []),
    ...(tight && !splitButtons ? [$tightChip] : []),
    ...(outOfTime ? [{ backgroundColor: colors.error }] : []),
    ...(canPress ? [] : [$passive]),
  ]

  if (!canPress)
    return (
      <View testID={`turn-chip-${seatNumber}`} accessible accessibilityLabel={label} style={shape}>
        {content}
      </View>
    )
  if (splitButtons && nextSeat) {
    return (
      <View testID={`turn-chip-${seatNumber}`} style={shape}>
        {passOnly ? null : (
          <BoardPressable
            testID={`turn-chip-clock-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={
              paused ? translate("board:turn.resumeClock") : translate("board:turn.pauseClock")
            }
            accessibilityHint={translate("board:turn.longPressHint")}
            hitSlop={{ top: 6, bottom: 6 }}
            delayLongPress={450}
            onPress={state.onPause}
            onLongPress={state.onLongPress}
            style={({ pressed }) => [
              $clockSegment,
              tight && $clockSegmentTight,
              paused && $pausedSegment,
              pressed && $pressed,
            ]}
          >
            {paused ? <PlayGlyph color={ink} /> : tight ? null : <PauseGlyph color={ink} />}
            <Text
              text={shownTime}
              testID={outOfTime ? "turn-chip-out-of-time" : "turn-chip-time"}
              weight="bold"
              style={[themed(compact ? $compactValue : $value), $digits, { color: ink }]}
            />
          </BoardPressable>
        )}
        <BoardPressable
          testID={`turn-chip-pass-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={translate("board:turn.longPressHint")}
          hitSlop={{ top: 6, bottom: 6 }}
          delayLongPress={450}
          onPress={() => next && state.onPass(next)}
          onLongPress={state.onLongPress}
          style={({ pressed }) => [
            $passSegment,
            $passSegmentFlush,
            passOnly && $passSegmentAlone,
            tight && $passSegmentTight,
            { backgroundColor: nextSeat.color },
            pressed && $pressed,
          ]}
        >
          {passSegmentContent}
        </BoardPressable>
      </View>
    )
  }
  return (
    <BoardPressable
      testID={`turn-chip-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={translate("board:turn.longPressHint")}
      hitSlop={{ top: 6, bottom: 6 }}
      delayLongPress={450}
      onPress={() => {
        if (waiting) state.onStart()
        else if (next) state.onPass(next)
      }}
      onLongPress={state.onLongPress}
      style={({ pressed }) => [...shape, pressed && $pressed]}
    >
      {content}
    </BoardPressable>
  )
}

export function PriorityChip({
  state,
  seatNumber,
  foreground,
  compact,
  size = "full",
}: {
  state: PriorityChipState
  seatNumber: number
  foreground: string
  compact?: boolean
  size?: TurnChipSize
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const ticking = state.active && !state.turn.paused
  const now = useNow(ticking)
  const bank = bankLeft(state.turn, state.playerId, now)
  const outOfTime = bank !== undefined && bank <= 0
  const clockMs = Math.max(0, bank ?? 0)
  const time = formatElapsed(clockMs)
  const shownTime =
    size === "pass" && clockMs >= WHOLE_MINUTES_FROM_MS
      ? translate("board:turn.chipMinutes", { minutes: Math.floor(clockMs / 60_000) })
      : time
  const tight = size !== "full"
  const ink = outOfTime ? colors.board.text : foreground
  const label = [
    time,
    state.canPress
      ? state.active
        ? translate("board:turn.returnClockHint")
        : translate("board:turn.respondHint")
      : undefined,
  ]
    .filter(Boolean)
    .join(". ")
  const shape: ViewStyle[] = [
    compact ? $compactChip : $chip,
    ...(tight ? [$priorityTight] : []),
    state.active ? $priorityActive : $priorityIdle,
    ...(outOfTime ? [{ backgroundColor: colors.error }] : []),
    ...(state.canPress ? [] : [$passive]),
  ]
  const content = (
    <>
      {state.active ? <PauseGlyph color={ink} /> : tight ? null : <PlayGlyph color={ink} />}
      <Text
        text={shownTime}
        testID={`priority-chip-time-${seatNumber}`}
        weight="bold"
        style={[themed(compact ? $compactValue : $value), $digits, { color: ink }]}
      />
    </>
  )
  if (!state.canPress) {
    return (
      <View
        testID={`priority-chip-${seatNumber}`}
        accessible
        accessibilityLabel={label}
        style={shape}
      >
        {content}
      </View>
    )
  }
  return (
    <BoardPressable
      testID={`priority-chip-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={state.onToggle}
      style={({ pressed }) => [...shape, pressed && $pressed]}
    >
      {content}
    </BoardPressable>
  )
}

export function UndoPassChip({
  seatNumber,
  foreground,
  compact,
  onUndo,
}: {
  seatNumber: number
  foreground: string
  compact?: boolean
  onUndo: () => void
}) {
  return (
    <Animated.View entering={FadeIn.duration(HANDOFF_MS)} exiting={FadeOut.duration(NAME_OUT_MS)}>
      <BoardPressable
        testID={`turn-undo-pass-${seatNumber}`}
        accessibilityRole="button"
        accessibilityLabel={translate("board:turn.undoPass")}
        hitSlop={{ top: 6, bottom: 6 }}
        onPress={onUndo}
        style={({ pressed }) => [compact ? $compactChip : $chip, pressed && $pressed]}
      >
        <UndoGlyph color={foreground} />
        <Text
          tx="common:undo"
          weight="semiBold"
          style={[compact ? $compactWord : $word, { color: foreground }]}
        />
      </BoardPressable>
    </Animated.View>
  )
}

/** why: a chip shown before it is measured lands past the name, then slides back once the name retracts; holding it hidden until measured lets the name leave first. */
export function RowChipSlot({
  testID,
  retracting,
  onWidth,
  children,
}: {
  testID: string
  retracting: boolean
  onWidth: (width: number) => void
  children: ReactNode
}) {
  const reducedMotion = useReducedMotion()
  const shown = useSharedValue(0)
  const [measured, setMeasured] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (!measured || started.current) return
    started.current = true
    shown.value = reducedMotion
      ? 1
      : withDelay(
          retracting ? NAME_OUT_MS : 0,
          withTiming(1, { duration: HANDOFF_MS, easing: Easing.out(Easing.cubic) }),
        )
  }, [measured, retracting, reducedMotion, shown])
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.6 + 0.4 * shown.value }],
  }))
  return (
    <Animated.View
      exiting={reducedMotion ? undefined : FadeOut.duration(NAME_OUT_MS)}
      style={!measured && $measuringAside}
    >
      <Animated.View style={[$growFromMark, style]}>
        <View
          testID={testID}
          onLayout={({ nativeEvent: { layout } }) => {
            onWidth(layout.width)
            setMeasured(true)
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  )
}

export function FadeOutSlot({ children }: { children: ReactNode }) {
  return <Animated.View exiting={FadeOut.duration(NAME_OUT_MS)}>{children}</Animated.View>
}

function UndoGlyph({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

function PlayGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d="M7 4.5v15l12-7.5z" fill={color} />
    </Svg>
  )
}

function PauseGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d="M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z" fill={color} />
    </Svg>
  )
}

function ChevronGlyph({ color }: { color: string }) {
  return (
    <Svg width={9} height={12} viewBox="0 0 9 12">
      <Path
        d="M2 1.5 6.5 6 2 10.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

const $growFromMark: ViewStyle = { transformOrigin: "left center" }
// why: measured in the flow, the hidden chip squeezes the name to "Playe…" for a frame before it retracts, which reads as the name jumping.
const $measuringAside: ViewStyle = {
  position: "absolute",
  left: 0,
  width: 1_000,
  flexDirection: "row",
  alignItems: "center",
}
const $layer: ViewStyle = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }
const $slot: ViewStyle = { position: "absolute" }
const $measuring: ViewStyle = { opacity: 0 }
const $chip: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 36,
  paddingHorizontal: 12,
  borderRadius: 999,
  backgroundColor: "rgba(0,0,0,0.22)",
}
const $compactChip: ViewStyle = { ...$chip, minHeight: 32 }
const $value: ThemedStyle<TextStyle> = () => ({ fontSize: 15, lineHeight: 18 })
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 14, lineHeight: 17 })
const $digits: TextStyle = { fontVariant: ["tabular-nums"] }
const $word: TextStyle = { fontSize: 12, lineHeight: 15 }
const $compactWord: TextStyle = { fontSize: 11, lineHeight: 14 }
const $split: ViewStyle = { paddingRight: 0, overflow: "hidden" }
const $splitButtons: ViewStyle = { paddingLeft: 0, gap: 0 }
const $clockSegment: ViewStyle = {
  alignSelf: "stretch",
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingLeft: 12,
  paddingRight: 10,
}
const $pausedSegment: ViewStyle = { opacity: 0.72 }
const $passSegment: ViewStyle = {
  alignSelf: "stretch",
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingLeft: 10,
  paddingRight: 12,
  marginLeft: 4,
}
const $passSegmentFlush: ViewStyle = { marginLeft: 0 }
const $passOnly: ViewStyle = { paddingLeft: 0 }
const $passSegmentAlone: ViewStyle = { marginLeft: 0, paddingLeft: 12 }
const $priorityIdle: ViewStyle = { opacity: 0.55 }
const $priorityActive: ViewStyle = { backgroundColor: "rgba(0,0,0,0.38)" }
const $priorityTight: ViewStyle = { paddingHorizontal: 8, gap: 4 }
const $tightChip: ViewStyle = { paddingLeft: 8 }
const $passSegmentTight: ViewStyle = { marginLeft: 0, paddingLeft: 5, paddingRight: 7 }
const $clockSegmentTight: ViewStyle = { paddingLeft: 7, paddingRight: 5 }
const $passive: ViewStyle = { opacity: 0.7 }
const $pressed: ViewStyle = { opacity: 0.6, transform: [{ scale: 0.94 }] }
