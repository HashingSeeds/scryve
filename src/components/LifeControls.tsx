import { useRef } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"

import { counterValueLabel, playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { LifeCardContentRotation } from "./playerCardTypes"
import { Text } from "./Text"

export interface LifeControlsProps {
  playerName: string
  seatNumber?: number
  disabled?: boolean
  contrastCheckedForeground?: string
  compact?: boolean
  contentRotation?: LifeCardContentRotation
  system?: PlaySystemId
  recentDelta?: number
  onChange: (delta: LifeDelta) => void
  onLongChange?: (direction: -1 | 1, amount?: number) => void
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
  system = "mtg",
  recentDelta = 0,
  onChange,
  onLongChange,
  style,
}: LifeControlsProps) {
  const { themed } = useAppTheme()
  const longPressHandled = useRef<LifeDelta | null>(null)
  const displayName = playerName.trim() || "unnamed player"
  const contentRotationStyle: TextStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const identity = `Seat ${seatNumber}, ${displayName}`
  const sideways = Math.abs(contentRotation) === 90
  const counter = playSystemRules(system).counter

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
          const delta = direction * counter.tapStep
          const feedback =
            direction * recentDelta > 0
              ? recentDelta > 0
                ? `+${recentDelta}`
                : `-${Math.abs(recentDelta)}`
              : glyph
          return (
            <Pressable
              key={delta}
              testID={lifeControlTestId(seatNumber, delta)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!disabled }}
              accessibilityLabel={labelFor(delta)}
              accessibilityHint={
                counter.longPressStep
                  ? `Tap to change ${identity}'s ${counter.label} by ${delta}. Long press to change it by ${direction * counter.longPressStep}.`
                  : `Tap to change ${identity}'s ${counter.label} by ${delta}. Long press to enter a custom amount.`
              }
              accessibilityActions={[
                {
                  name: "longpress",
                  label: counter.longPressStep
                    ? labelFor(direction * counter.longPressStep)
                    : `${identity}, ${direction > 0 ? "add" : "subtract"} a custom amount`,
                },
              ]}
              style={({ pressed }) => [
                themed($zone),
                sideways
                  ? themed($zoneSideways)
                  : edge === "left"
                    ? themed($zoneLeft)
                    : themed($zoneRight),
                pressed && !disabled && { backgroundColor: overlayTint(foreground, 0.14) },
              ]}
              delayLongPress={450}
              onPressIn={() => {
                longPressHandled.current = null
              }}
              onLongPress={() => {
                longPressHandled.current = direction
                onLongChange?.(direction, counter.longPressStep)
              }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "longpress")
                  onLongChange?.(direction, counter.longPressStep)
              }}
              onPress={() => {
                if (longPressHandled.current === direction) {
                  longPressHandled.current = null
                  return
                }
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
            </Pressable>
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
const $zoneSideways: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingHorizontal: 0,
  paddingVertical: spacing.xs,
})

const $glyph: ThemedStyle<TextStyle> = () => ({
  fontSize: 44,
  lineHeight: 50,
  opacity: 0.6,
})

const $compactGlyph: ThemedStyle<TextStyle> = () => ({
  fontSize: 30,
  lineHeight: 34,
  opacity: 0.6,
})
