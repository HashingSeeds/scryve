import { useEffect, useReducer, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Svg, { Path } from "react-native-svg"

import type { TurnChipState } from "@/features/game/dice"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { formatElapsed } from "@/utils/useElapsedSince"

import { BoardPressable } from "./BoardPressable"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import { CONTENT_EDGES } from "./playerGridGeometry"
import { MarkArt } from "./PlayerMark"
import { contentInsetsFor, rotatedLayerStyle } from "./pokemon/pokemonCardLayout"
import { Text } from "./Text"
import { useTurnSpotlight } from "./TurnSpotlight"
import { shapeForSeat } from "../../convex/lib/appearance"
import { bankLeft, turnElapsed } from "../../convex/lib/turns"

const TICK_MS = 1_000
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

export function TurnChipLayer({
  state,
  seatNumber,
  foreground,
  compact,
  rotation,
  cardSize,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  filled,
}: {
  state: TurnChipState
  seatNumber: number
  foreground: string
  compact?: boolean
  filled?: boolean
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
        <TurnChip
          state={state}
          seatNumber={seatNumber}
          foreground={foreground}
          compact={compact}
          filled={filled}
        />
      </View>
    </View>
  )
}

export function TurnChip({
  state,
  seatNumber,
  foreground,
  compact,
  filled,
}: {
  state: TurnChipState
  seatNumber: number
  foreground: string
  compact?: boolean
  filled?: boolean
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { turn, canPress } = state
  const next = useTurnSpotlight()?.passTo
  const now = useNow(!turn.waiting)
  const bank = bankLeft(turn, turn.playerId, now)
  const outOfTime = bank !== undefined && bank <= 0
  const time = formatElapsed(bank === undefined ? turnElapsed(turn, now) : Math.max(0, bank))
  const tick = Math.floor(now / TICK_MS) % 2 === 0
  const ink = outOfTime ? colors.board.text : foreground
  const name = state.nameOf(turn.playerId) ?? ""
  const nextName = next ? state.nameOf(next) : undefined
  const nextSeat = next ? state.seatOf?.(next) : undefined
  const label = [
    translate("board:turn.label", { number: turn.number, name }),
    turn.waiting ? undefined : outOfTime ? translate("board:turn.outOfTime") : time,
    canPress
      ? turn.waiting
        ? translate("board:turn.startHint")
        : nextName
          ? translate("board:turn.passHintTo", { name: nextName })
          : undefined
      : undefined,
  ]
    .filter(Boolean)
    .join(". ")

  const content = turn.waiting ? (
    <>
      <PlayGlyph color={ink} />
      <Text tx="board:turn.start" weight="bold" style={[themed($value), { color: ink }]} />
    </>
  ) : filled ? (
    <>
      <Text
        text={time}
        testID={outOfTime ? "turn-chip-out-of-time" : "turn-chip-time"}
        weight="bold"
        style={[themed(compact ? $compactValue : $value), $digits, { color: ink }]}
      />
      {nextSeat && !outOfTime ? (
        <>
          <ChevronGlyph color={ink} />
          <MarkArt
            shape={nextSeat.shape ?? shapeForSeat(nextSeat.seatNumber)}
            color={nextSeat.color}
            size={compact ? 18 : 20}
          />
        </>
      ) : null}
    </>
  ) : (
    <>
      {outOfTime ? null : (
        <View
          testID="turn-chip-tick"
          style={[$dot, tick ? $tickOn : $tickOff, { backgroundColor: ink }]}
        />
      )}
      <Text
        text={time}
        testID={outOfTime ? "turn-chip-out-of-time" : "turn-chip-time"}
        weight="bold"
        style={[themed(compact ? $compactValue : $value), $digits, { color: ink }]}
      />
      {canPress && !outOfTime ? (
        <>
          <View style={[$rule, { backgroundColor: ink }]} />
          <Text
            tx="board:turn.pass"
            weight="semiBold"
            style={[compact ? $compactWord : $word, { color: ink }]}
          />
        </>
      ) : null}
    </>
  )

  const shape: ViewStyle[] = [
    themed(compact ? $compactChip : $chip),
    filled ? $filled : { borderColor: foreground },
    ...(outOfTime ? [{ backgroundColor: colors.error, borderColor: colors.error }] : []),
    ...(canPress ? [] : [filled ? $filledPassive : $passive]),
  ]

  if (!canPress)
    return (
      <View testID={`turn-chip-${seatNumber}`} accessible accessibilityLabel={label} style={shape}>
        {content}
      </View>
    )
  return (
    <BoardPressable
      testID={`turn-chip-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={translate("board:turn.longPressHint")}
      hitSlop={{ top: 6, bottom: 6 }}
      delayLongPress={450}
      onPress={() => {
        if (turn.waiting) state.onStart()
        else if (next) state.onPass(next)
      }}
      onLongPress={state.onLongPress}
      style={({ pressed }) => [...shape, pressed && $pressed]}
    >
      {content}
    </BoardPressable>
  )
}

function PlayGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d="M7 4.5v15l12-7.5z" fill={color} />
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

const $layer: ViewStyle = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }
const $slot: ViewStyle = { position: "absolute" }
const $measuring: ViewStyle = { opacity: 0 }
const $chip: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxs,
  minHeight: 36,
  paddingHorizontal: spacing.xs,
  borderRadius: radius.md,
  borderWidth: 1.5,
})
const $compactChip: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxs,
  minHeight: 32,
  paddingHorizontal: spacing.xs,
  borderRadius: radius.md,
  borderWidth: 1.5,
})
const $value: ThemedStyle<TextStyle> = () => ({ fontSize: 15, lineHeight: 18 })
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 14, lineHeight: 17 })
const $digits: TextStyle = { fontVariant: ["tabular-nums"] }
const $word: TextStyle = { fontSize: 12, lineHeight: 15 }
const $compactWord: TextStyle = { fontSize: 11, lineHeight: 14 }
const $rule: ViewStyle = { width: 1, alignSelf: "stretch", marginVertical: 8, opacity: 0.6 }
const $dot: ViewStyle = { width: 5, height: 5, borderRadius: 3 }
const $tickOn: ViewStyle = { opacity: 0.9 }
const $tickOff: ViewStyle = { opacity: 0.3 }
const $filled: ViewStyle = {
  borderWidth: 0,
  borderRadius: 999,
  backgroundColor: "rgba(0,0,0,0.22)",
  paddingHorizontal: 12,
  gap: 6,
}
const $filledPassive: ViewStyle = { opacity: 0.7 }
const $passive: ViewStyle = { opacity: 0.7, borderStyle: "dashed" }
const $pressed: ViewStyle = { opacity: 0.6, transform: [{ scale: 0.94 }] }
