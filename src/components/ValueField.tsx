import { useEffect, useRef } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { overlayTint } from "./LifeControls"
import { Text } from "./Text"

export interface ValueFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  longStep?: number
  testID?: string
  onChange: (next: number) => void
}

const ZONES: readonly { direction: -1 | 1; glyph: string; word: string }[] = [
  { direction: -1, glyph: "−", word: "Decrease" },
  { direction: 1, glyph: "+", word: "Increase" },
]

export function ValueField({
  label,
  value,
  min,
  max,
  step = 1,
  longStep,
  testID,
  onChange,
}: ValueFieldProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const compactValue = String(value).length >= 4
  const veryCompactValue = String(value).length >= 6
  const scale = useSharedValue(1)
  const longPressDirection = useRef<-1 | 1 | null>(null)

  useEffect(() => {
    if (reducedMotion !== false) return
    scale.value = withSpring(1.08, { damping: 12, stiffness: 320 }, () => {
      scale.value = withSpring(1, { damping: 14, stiffness: 260 })
    })
  }, [value, reducedMotion, scale])

  const $pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  function apply(direction: -1 | 1, amount: number) {
    const next = Math.min(max, Math.max(min, value + direction * amount))
    if (next !== value) onChange(next)
  }

  return (
    <View style={themed($field)}>
      <Animated.View pointerEvents="none" style={[themed($readout), $pulse]}>
        <Text
          text={String(value)}
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          accessibilityLabel={`${label}, ${value}`}
          style={[
            themed($value),
            compactValue && themed($compactValue),
            veryCompactValue && themed($veryCompactValue),
            { color: colors.text },
          ]}
        />
      </Animated.View>
      <Text pointerEvents="none" text={label} style={themed($caption)} />
      <View style={themed($zones)}>
        {ZONES.map(({ direction, glyph, word }) => (
          <Pressable
            key={direction}
            testID={testID ? `${testID}-${direction < 0 ? "decrement" : "increment"}` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${word} ${label} by ${step}`}
            accessibilityHint={longStep ? `Long press to change it by ${longStep}.` : undefined}
            disabled={direction < 0 ? value <= min : value >= max}
            accessibilityState={{ disabled: direction < 0 ? value <= min : value >= max }}
            delayLongPress={450}
            onPressIn={() => {
              longPressDirection.current = null
            }}
            onLongPress={() => {
              longPressDirection.current = direction
              apply(direction, longStep ?? step)
            }}
            onPress={() => {
              if (longPressDirection.current === direction) {
                longPressDirection.current = null
                return
              }
              apply(direction, step)
            }}
            style={({ pressed }) => [
              themed($zone),
              direction < 0 ? themed($zoneLeft) : themed($zoneRight),
              pressed && { backgroundColor: overlayTint(colors.text, 0.14) },
            ]}
          >
            <Text
              text={glyph}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={themed($glyph)}
            />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const $field: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 132,
  borderRadius: 16,
  overflow: "hidden",
  justifyContent: "center",
  backgroundColor: colors.surfaceRaised,
})
const $readout: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})
const $value: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 60,
  lineHeight: 66,
})
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 44, lineHeight: 52 })
const $veryCompactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 34, lineHeight: 42 })
const $caption: ThemedStyle<TextStyle> = () => ({
  position: "absolute",
  bottom: 14,
  alignSelf: "center",
  fontSize: 12,
  lineHeight: 16,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  opacity: 0.72,
})
const $zones: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  flexDirection: "row",
})
const $zone: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})
const $zoneLeft: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-start" })
const $zoneRight: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-end" })
const $glyph: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.text,
  fontSize: 40,
  lineHeight: 46,
  opacity: 0.6,
})
