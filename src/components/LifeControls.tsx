import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"

import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { BoardPressable } from "./BoardPressable"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  LIFE_GLYPH_LINE_HEIGHT,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { Text } from "./Text"

export interface LifeControlsProps {
  playerName: string
  seatNumber?: number
  disabled?: boolean
  contrastCheckedForeground?: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  system?: PlaySystemId
  lifeStep?: number
  recentDelta?: RecentDelta
  pendingDelta?: number
  onChange: (delta: LifeDelta) => void
  onLongChange?: (direction: -1 | 1) => void
  onPreview?: (pendingDelta: number) => void
  style?: StyleProp<ViewStyle>
}

const HALF_CARD_ZONES: readonly {
  direction: -1 | 1
  glyph: string
  edge: "left" | "right"
}[] = [
  { direction: -1, glyph: "−", edge: "left" },
  { direction: 1, glyph: "+", edge: "right" },
]

const RECENT_DELTA_VISIBLE_MS = 1800

export interface RecentDelta {
  get: () => number
  subscribe: (listener: () => void) => () => void
}

const NO_RECENT_DELTA: RecentDelta = { get: () => 0, subscribe: () => () => {} }

export function useRecentDelta(life: number): RecentDelta {
  const [store] = useState(createRecentDeltaStore)
  const previousLife = useRef(life)
  useLayoutEffect(() => {
    const difference = life - previousLife.current
    previousLife.current = life
    if (difference !== 0) store.add(difference)
  }, [life, store])
  useEffect(() => store.stop, [store])
  return store
}

function createRecentDeltaStore() {
  let delta = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: number) => {
    delta = next
    for (const listener of listeners) listener()
  }
  return {
    get: () => delta,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    add: (difference: number) => {
      publish(delta + difference)
      clearTimeout(timer)
      timer = setTimeout(() => publish(0), RECENT_DELTA_VISIBLE_MS)
    },
    stop: () => clearTimeout(timer),
  }
}

function deltaText(delta: number) {
  return delta > 0 ? `+${delta}` : `-${Math.abs(delta)}`
}

export function RecentDeltaLabel({
  seatNumber,
  recentDelta: recentDeltaStore,
  pendingDelta = 0,
  lifeFontSize,
  compact,
  contentRotation = 0,
  foreground,
}: {
  seatNumber: number
  recentDelta: RecentDelta
  pendingDelta?: number
  lifeFontSize: number
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  foreground: string
}) {
  const recentDelta =
    useSyncExternalStore(recentDeltaStore.subscribe, recentDeltaStore.get) + pendingDelta
  if (!recentDelta) return null
  const fontSize = compact ? 16 : 24
  // why: the label clears the digits' cap height, which is about 0.75 of the font size.
  const lift = lifeFontSize * 0.375 + fontSize * 0.5 + (compact ? 6 : 12)
  const [dx, dy] = { 0: [0, -lift], 180: [0, lift], 90: [lift, 0], [-90]: [-lift, 0] }[
    contentRotation
  ]
  return (
    <View
      testID={`life-recent-delta-seat-${seatNumber}`}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[$recentDelta, { transform: [{ translateX: dx }, { translateY: dy }] }]}
    >
      <Text
        text={deltaText(recentDelta)}
        weight="semiBold"
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          color: foreground,
          fontSize,
          lineHeight: Math.round(fontSize * 1.25),
          fontVariant: ["tabular-nums"],
          transform: [{ rotate: `${contentRotation}deg` }],
        }}
      />
    </View>
  )
}

export function lifeControlTestId(seatNumber: number, delta: LifeDelta) {
  return `life-seat-${seatNumber}-${delta}`
}

export function overlayTint(foreground: string, alpha: number) {
  return foreground === "#FFFFFF" ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
}

export function LifeControls({
  playerName,
  seatNumber = 1,
  disabled,
  contrastCheckedForeground: foreground = "#FFFFFF",
  compact,
  contentRotation = 0,
  system,
  lifeStep,
  recentDelta: recentDeltaStore = NO_RECENT_DELTA,
  pendingDelta = 0,
  onChange,
  onLongChange,
  onPreview,
  style,
}: LifeControlsProps) {
  const { themed } = useAppTheme()
  const recentDelta =
    useSyncExternalStore(recentDeltaStore.subscribe, recentDeltaStore.get) + pendingDelta
  const longPressHandled = useRef<LifeDelta | null>(null)
  // why: a zone that freezes or unmounts mid-press never reports press-out, so drop its preview.
  useEffect(() => {
    if (disabled) onPreview?.(0)
    return () => onPreview?.(0)
  }, [disabled, onPreview])
  const displayName = playerName.trim() || "unnamed player"
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const identity = `Seat ${seatNumber}, ${displayName}`
  const sideways = Math.abs(contentRotation) === 90
  const counter = playSystemRules(system).counter
  const tapStep = lifeStep ?? counter.tapStep
  // why: a calculator counter shows its running change above the total, so the glyphs stay put.
  const glyphFeedback = !counter.calculator

  function labelFor(delta: LifeDelta) {
    return `${identity}, ${delta > 0 ? "add" : "subtract"} ${counterValueLabel(system, Math.abs(delta))}`
  }

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]}>
      <View
        testID="life-control-zones"
        pointerEvents="box-none"
        style={themed(
          contentRotation === 90
            ? $zonesFacingLeft
            : contentRotation === -90
              ? $zonesFacingRight
              : $zones,
        )}
      >
        {HALF_CARD_ZONES.map(({ direction, glyph, edge }) => {
          const delta = direction * tapStep
          const pinsToTopEdge = direction === (contentRotation === 90 ? -1 : 1)
          const feedback =
            glyphFeedback && direction * recentDelta > 0 ? deltaText(recentDelta) : glyph
          return (
            <BoardPressable
              key={delta}
              testID={lifeControlTestId(seatNumber, delta)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!disabled }}
              accessibilityLabel={labelFor(delta)}
              accessibilityHint={`Tap to change ${identity}'s ${counter.label} by ${delta}. Long press for more controls.`}
              accessibilityActions={[
                {
                  name: "longpress",
                  label: `${identity}, more ${counter.label} controls`,
                },
              ]}
              style={({ pressed }) => [
                themed($zone),
                sideways
                  ? themed(pinsToTopEdge ? $zoneSidewaysTop : $zoneSidewaysBottom)
                  : edge === "left"
                    ? themed($zoneLeft)
                    : themed($zoneRight),
                pressed && !disabled && { backgroundColor: overlayTint(foreground, 0.14) },
              ]}
              delayLongPress={450}
              onPressIn={() => {
                longPressHandled.current = null
                onPreview?.(delta)
              }}
              onPressOut={() => onPreview?.(0)}
              onLongPress={() => {
                longPressHandled.current = direction
                onPreview?.(0)
                onLongChange?.(direction)
              }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "longpress") onLongChange?.(direction)
              }}
              onPress={() => {
                if (longPressHandled.current === direction) {
                  longPressHandled.current = null
                  return
                }
                // why: onPressOut can land after onPress; clearing here keeps a tap from counting twice.
                onPreview?.(0)
                onChange(delta)
              }}
            >
              <Text
                text={feedback}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[
                  themed(compact ? $compactGlyph : $glyph),
                  contentRotationStyle,
                  { color: foreground },
                ]}
              />
            </BoardPressable>
          )
        })}
      </View>
    </View>
  )
}

const $recentDelta: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
}

const $zones: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  flexDirection: "row",
})
const $zonesFacingLeft: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  flexDirection: "column",
})
const $zonesFacingRight: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  flexDirection: "column-reverse",
})

const $zone: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
})

const $zoneLeft: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-start" })
const $zoneRight: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-end" })
const $zoneSidewaysTop: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "flex-start",
  paddingHorizontal: 0,
  paddingVertical: spacing.xs,
})
const $zoneSidewaysBottom: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "flex-end",
  paddingHorizontal: 0,
  paddingVertical: spacing.xs,
})

const $glyph: ThemedStyle<TextStyle> = () => ({
  fontSize: 44,
  lineHeight: LIFE_GLYPH_LINE_HEIGHT,
  opacity: 0.6,
})

const $compactGlyph: ThemedStyle<TextStyle> = () => ({
  fontSize: 30,
  lineHeight: COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  opacity: 0.6,
})
