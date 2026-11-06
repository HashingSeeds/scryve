import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { LayoutRectangle, StyleProp, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, useWindowDimensions, View } from "react-native"
import * as Haptics from "expo-haptics"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"

import { LIFE_BURST_MS } from "@/features/game/LifeLog"
import { localGameRepository } from "@/features/game/localPersistence"
import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { ReducedMotionPreference } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DIGIT_INK_HEIGHT, type ReadoutInk } from "./commanderDamageLayout"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  getDeltaFontSizeThatFits,
  getDeltaTextWidth,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_MAX_FONT_SCALE,
  type LifeCardContentRotation,
  type LifeCardEdge,
} from "./playerCardTypes"
import { seatIdentityLabel } from "./SeatIdentity"
import { Text } from "./Text"

export interface LifeControlsProps {
  playerName: string
  seatNumber?: number
  disabled?: boolean
  lockedReason?: string
  reducedMotion?: ReducedMotionPreference
  contrastCheckedForeground?: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  system?: PlaySystemId
  lifeStep?: number
  recentDelta?: RecentDelta
  pendingDelta?: number
  lifeFontSize?: number
  lifeDigits?: number
  obstacle?: { edge: LifeCardEdge; bounds: LayoutRectangle }
  totalInk?: ReadoutInk
  onChange: (delta: LifeDelta) => void
  onOpenEditor?: () => void
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

const SLIDE_PADDING = {
  x: ["paddingLeft", "paddingRight"],
  y: ["paddingTop", "paddingBottom"],
} as const

function sidewaysZoneEdge(pinsToTopEdge: boolean): LifeCardEdge {
  return pinsToTopEdge ? "top" : "bottom"
}

/** why: on a short seat the commander grid reaches the middle of its end, so the glyph there slides along its edge until it clears the grid, and never steps inward toward the total. */
export function glyphSlide(
  { edge, bounds }: { edge: LifeCardEdge; bounds: LayoutRectangle },
  zones: { width: number; height: number },
  glyphSize: number,
  gap: number,
): ViewStyle | undefined {
  const alongY = edge === "left" || edge === "right"
  const [start, length, run] = alongY
    ? [bounds.y, bounds.height, zones.height]
    : [bounds.x, bounds.width, zones.width]
  if (start >= (run + glyphSize) / 2 || start + length <= (run - glyphSize) / 2) return undefined
  const gridAtFarEnd = start + length / 2 > run / 2
  // why: the zone centers its glyph, so padding the grid's side by twice the overlap moves the glyph by the overlap; it stops where the glyph meets the far end.
  const padding = gridAtFarEnd
    ? run - 2 * (start - gap - glyphSize / 2)
    : 2 * (start + length + gap + glyphSize / 2) - run
  return {
    [SLIDE_PADDING[alongY ? "y" : "x"][gridAtFarEnd ? 1 : 0]]: Math.min(padding, run - glyphSize),
  }
}

export function totalTargetBox(
  ink: ReadoutInk,
  zones: { width: number; height: number },
  rotation: LifeCardContentRotation,
  fontScale: number,
) {
  const scale = Math.min(fontScale, LIFE_MAX_FONT_SCALE)
  const upright = {
    width: Math.max(ink.width * scale + TOTAL_TARGET_PAD * 2, TOTAL_TARGET_MIN),
    height: Math.max(ink.height * scale + TOTAL_TARGET_PAD * 2, TOTAL_TARGET_MIN),
  }
  const sideways = Math.abs(rotation) === 90
  const width = sideways ? upright.height : upright.width
  const height = sideways ? upright.width : upright.height
  const radians = (rotation * Math.PI) / 180
  const y = ink.y * scale
  return {
    left: (zones.width - width) / 2 - y * Math.round(Math.sin(radians)),
    top: (zones.height - height) / 2 + y * Math.round(Math.cos(radians)),
    width,
    height,
  }
}

const TOTAL_TARGET_PAD = 10
const TOTAL_TARGET_MIN = 44
// why: a hold opens the editor without a step, so its press-in preview leaves once the press outlasts a tap.
const TAP_PREVIEW_MS = 150
const BUMP_DISTANCE = 4

export interface RecentDelta {
  get: () => number
  subscribe: (listener: () => void) => () => void
}

const NO_RECENT_DELTA: RecentDelta = { get: () => 0, subscribe: () => () => {} }

export function useRecentDelta(life: number, playerId?: string): RecentDelta {
  const [store] = useState(createRecentDeltaStore)
  const previous = useRef({ life, playerId })
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { life, playerId }
    if (before.playerId !== playerId) store.clear()
    else if (life !== before.life) store.add(life - before.life)
  }, [life, playerId, store])
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
      timer = setTimeout(() => publish(0), LIFE_BURST_MS)
    },
    clear: () => {
      clearTimeout(timer)
      if (delta !== 0) publish(0)
    },
    stop: () => clearTimeout(timer),
  }
}

function bumpStyle(
  progress: number,
  direction: -1 | 1,
  reducedMotion: ReducedMotionPreference,
  contentRotation: LifeCardContentRotation,
) {
  "worklet"
  if (reducedMotion !== false) return { opacity: 1 - 0.6 * progress }
  const distance = BUMP_DISTANCE * progress
  if (Math.abs(contentRotation) !== 90) return { transform: [{ translateX: direction * distance }] }
  const towardTop = direction === (contentRotation === 90 ? -1 : 1)
  return { transform: [{ translateY: towardTop ? -distance : distance }] }
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
  reducedMotion = null,
  contrastCheckedForeground: foreground = "#FFFFFF",
  compact,
  contentRotation = 0,
  system,
  lifeStep,
  recentDelta: recentDeltaStore = NO_RECENT_DELTA,
  pendingDelta = 0,
  lifeFontSize = 0,
  lifeDigits = 0,
  obstacle,
  totalInk,
  onChange,
  onOpenEditor,
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
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const endPreview = useCallback(() => {
    clearTimeout(previewTimer.current)
    onPreview?.(0)
  }, [onPreview])
  // why: a zone that freezes or unmounts mid-press never reports press-out, so drop its preview.
  useEffect(() => {
    if (disabled) endPreview()
    return endPreview
  }, [disabled, endPreview])
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const identity = seatIdentityLabel(seatNumber, playerName)
  const sideways = Math.abs(contentRotation) === 90
  const rules = playSystemRules(system)
  const tapStep = lifeStep ?? rules.counter.tapStep
  const locked = lockedReason !== undefined && !disabled
  const minusBump = useSharedValue(0)
  const plusBump = useSharedValue(0)
  const minusBumpStyle = useAnimatedStyle(
    () => bumpStyle(minusBump.value, -1, reducedMotion, contentRotation),
    [reducedMotion, contentRotation],
  )
  const plusBumpStyle = useAnimatedStyle(
    () => bumpStyle(plusBump.value, 1, reducedMotion, contentRotation),
    [reducedMotion, contentRotation],
  )

  function bump(value: SharedValue<number>) {
    value.set(withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 140 })))
    if (reducedMotion === false && localGameRepository.loadSettings().hapticsEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined)
    }
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
          const zoneEdge = sideways ? sidewaysZoneEdge(pinsToTopEdge) : edge
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
          const glyphScale = Math.min(fontScale, LIFE_MAX_FONT_SCALE)
          const lineHeight =
            (compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT) * glyphScale
          // why: the grid only has to clear what the glyph inks, a delta's digits at most, not its taller line box.
          const slide =
            obstacle?.edge === zoneEdge
              ? glyphSlide(
                  obstacle,
                  zonesSize,
                  DIGIT_INK_HEIGHT * (compact ? COMPACT_GLYPH_SIZE : GLYPH_SIZE) * glyphScale,
                  spacing.xxs,
                )
              : undefined
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
                slide,
                pressed &&
                  !disabled &&
                  !locked && { backgroundColor: overlayTint(foreground, 0.14) },
              ]}
              delayLongPress={450}
              onPressIn={() => {
                if (locked) return
                longPressHandled.current = null
                onPreview?.(delta)
                clearTimeout(previewTimer.current)
                previewTimer.current = setTimeout(endPreview, TAP_PREVIEW_MS)
              }}
              onPressOut={endPreview}
              onLongPress={() => {
                if (locked) return
                longPressHandled.current = direction
                endPreview()
                onOpenEditor?.()
              }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "longpress") onOpenEditor?.()
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
                endPreview()
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
      {totalInk && onOpenEditor && zonesSize.width > 0 && !disabled && !locked ? (
        // why: the total is the first thing people tap, so it opens the editor instead of landing on the − or + half under it.
        <BoardPressable
          testID={`life-total-target-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate(`board:lifeControls.moreControls.${rules.id}`, {
            identity,
          })}
          onPress={onOpenEditor}
          style={({ pressed }) => [
            themed($totalTarget),
            totalTargetBox(totalInk, zonesSize, contentRotation, fontScale),
            pressed && { backgroundColor: overlayTint(foreground, 0.14) },
          ]}
        />
      ) : null}
    </View>
  )
}

const $totalTarget: ThemedStyle<ViewStyle> = ({ radius }) => ({
  borderRadius: radius.xxxl,
  position: "absolute",
})

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
})

const $compactGlyph: ThemedStyle<TextStyle> = () => ({
  fontSize: COMPACT_GLYPH_SIZE,
  lineHeight: COMPACT_LIFE_GLYPH_LINE_HEIGHT,
})

const $lockedGlyph: TextStyle = { opacity: 0.25 }
