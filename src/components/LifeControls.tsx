import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, useWindowDimensions, View } from "react-native"
import * as Haptics from "expo-haptics"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"

import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  getDeltaFontSizeThatFits,
  getDeltaTextWidth,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_MAX_FONT_SCALE,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { seatIdentityLabel } from "./SeatIdentity"
import { Text } from "./Text"

export interface LifeControlsProps {
  playerName: string
  seatNumber?: number
  disabled?: boolean
  /** why: an out seat still takes presses so it can say why nothing changed: the glyph bumps, the phone buzzes, and a screen reader hears this. */
  lockedReason?: string
  contrastCheckedForeground?: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  system?: PlaySystemId
  lifeStep?: number
  recentDelta?: RecentDelta
  pendingDelta?: number
  lifeFontSize?: number
  lifeDigits?: number
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
const BUMP_DISTANCE = 4

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
  lockedReason,
  contrastCheckedForeground: foreground = "#FFFFFF",
  compact,
  contentRotation = 0,
  system,
  lifeStep,
  recentDelta: recentDeltaStore = NO_RECENT_DELTA,
  pendingDelta = 0,
  lifeFontSize = 0,
  lifeDigits = 0,
  onChange,
  onLongChange,
  onPreview,
  style,
}: LifeControlsProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const { fontScale } = useWindowDimensions()
  const [zonesSize, setZonesSize] = useState({ width: 0, height: 0 })
  const recentDelta =
    useSyncExternalStore(recentDeltaStore.subscribe, recentDeltaStore.get) + pendingDelta
  const longPressHandled = useRef<LifeDelta | null>(null)
  // why: a zone that freezes or unmounts mid-press never reports press-out, so drop its preview.
  useEffect(() => {
    if (disabled) onPreview?.(0)
    return () => onPreview?.(0)
  }, [disabled, onPreview])
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const identity = seatIdentityLabel(seatNumber, playerName)
  const sideways = Math.abs(contentRotation) === 90
  const rules = playSystemRules(system)
  const tapStep = lifeStep ?? rules.counter.tapStep
  const locked = lockedReason !== undefined && !disabled
  const reducedMotion = useReducedMotion()
  const minusBump = useSharedValue(0)
  const plusBump = useSharedValue(0)
  const bumpStyle = (bump: SharedValue<number>, direction: -1 | 1) => {
    "worklet"
    if (reducedMotion !== false) return { opacity: 1 - 0.6 * bump.value }
    const distance = BUMP_DISTANCE * bump.value
    if (!sideways) return { transform: [{ translateX: direction * distance }] }
    const towardTop = direction === (contentRotation === 90 ? -1 : 1)
    return { transform: [{ translateY: towardTop ? -distance : distance }] }
  }
  const minusBumpStyle = useAnimatedStyle(() => bumpStyle(minusBump, -1))
  const plusBumpStyle = useAnimatedStyle(() => bumpStyle(plusBump, 1))

  function bump(value: SharedValue<number>) {
    value.set(withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 140 })))
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined)
  }

  function labelFor(delta: LifeDelta) {
    return translate(delta > 0 ? "board:lifeControls.add" : "board:lifeControls.subtract", {
      identity,
      amount: counterValueLabel(system, Math.abs(delta)),
    })
  }

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]}>
      <View
        testID="life-control-zones"
        pointerEvents="box-none"
        onLayout={({ nativeEvent: { layout } }) =>
          setZonesSize({ width: layout.width, height: layout.height })
        }
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
          const showingDelta = direction * recentDelta > 0
          const feedback = showingDelta ? deltaText(recentDelta) : glyph
          const deltaSize = showingDelta
            ? getDeltaFontSizeThatFits({
                text: feedback,
                baseSize: compact ? COMPACT_GLYPH_SIZE : GLYPH_SIZE,
                run: sideways ? zonesSize.height : zonesSize.width,
                inset: spacing.xs,
                lifeFontSize,
                lifeDigits,
                fontScale,
              })
            : undefined
          // why: a sideways glyph turns inside its unturned box, so a delta wider than the line height would reach past the card edge; move it inward by that overhang.
          const lineHeight =
            (compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT) *
            Math.min(fontScale, LIFE_MAX_FONT_SCALE)
          const overhang =
            sideways && deltaSize
              ? Math.max((getDeltaTextWidth(feedback, deltaSize, fontScale) - lineHeight) / 2, 0)
              : 0
          return (
            <BoardPressable
              key={delta}
              testID={lifeControlTestId(seatNumber, delta)}
              // why: Pressable writes its own `disabled` over accessibilityState, so a locked zone leaves it unset to read as disabled and still take the press.
              disabled={locked ? undefined : disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!disabled || locked }}
              accessibilityLabel={labelFor(delta)}
              accessibilityHint={
                locked
                  ? lockedReason
                  : translate(`board:lifeControls.hint.${rules.id}`, { identity, delta })
              }
              accessibilityActions={
                locked
                  ? undefined
                  : [
                      {
                        name: "longpress",
                        label: translate(`board:lifeControls.moreControls.${rules.id}`, {
                          identity,
                        }),
                      },
                    ]
              }
              style={({ pressed }) => [
                themed($zone),
                sideways
                  ? themed(pinsToTopEdge ? $zoneSidewaysTop : $zoneSidewaysBottom)
                  : edge === "left"
                    ? themed($zoneLeft)
                    : themed($zoneRight),
                pressed &&
                  !disabled &&
                  !locked && { backgroundColor: overlayTint(foreground, 0.14) },
              ]}
              delayLongPress={450}
              onPressIn={() => {
                if (locked) return
                longPressHandled.current = null
                onPreview?.(delta)
              }}
              onPressOut={() => onPreview?.(0)}
              onLongPress={() => {
                if (locked) return
                longPressHandled.current = direction
                onPreview?.(0)
                onLongChange?.(direction)
              }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "longpress") onLongChange?.(direction)
              }}
              onPress={() => {
                if (locked) {
                  bump(direction === -1 ? minusBump : plusBump)
                  return
                }
                if (longPressHandled.current === direction) {
                  longPressHandled.current = null
                  return
                }
                // why: onPressOut can land after onPress; clearing here keeps a tap from counting twice.
                onPreview?.(0)
                onChange(delta)
              }}
            >
              <Animated.View style={direction === -1 ? minusBumpStyle : plusBumpStyle}>
                <Text
                  text={feedback}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                  style={[
                    themed(compact ? $compactGlyph : $glyph),
                    deltaSize !== undefined && { fontSize: deltaSize },
                    overhang
                      ? {
                          transform: [
                            { translateY: pinsToTopEdge ? overhang : -overhang },
                            { rotate: `${contentRotation}deg` },
                          ],
                        }
                      : contentRotationStyle,
                    { color: foreground },
                    locked && $lockedGlyph,
                  ]}
                />
              </Animated.View>
            </BoardPressable>
          )
        })}
      </View>
    </View>
  )
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

const GLYPH_SIZE = 44
const COMPACT_GLYPH_SIZE = 30

const $glyph: ThemedStyle<TextStyle> = () => ({
  fontSize: GLYPH_SIZE,
  lineHeight: LIFE_GLYPH_LINE_HEIGHT,
  opacity: 0.6,
})

const $compactGlyph: ThemedStyle<TextStyle> = () => ({
  fontSize: COMPACT_GLYPH_SIZE,
  lineHeight: COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  opacity: 0.6,
})

const $lockedGlyph: TextStyle = { opacity: 0.25 }
