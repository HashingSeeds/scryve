import { useRef } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"

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
  onChange: (delta: LifeDelta) => void
  onLongChange?: (direction: -1 | 1) => void
  style?: StyleProp<ViewStyle>
}

const HALF_CARD_ZONES: readonly {
  delta: -1 | 1
  glyph: string
  edge: "left" | "right"
}[] = [
  { delta: -1, glyph: "−", edge: "left" },
  { delta: 1, glyph: "+", edge: "right" },
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

  function labelFor(delta: LifeDelta) {
    return `${identity}, ${delta > 0 ? "add" : "subtract"} ${Math.abs(delta)} life`
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
        {HALF_CARD_ZONES.map(({ delta, glyph, edge }) => (
          <Pressable
            key={delta}
            testID={lifeControlTestId(seatNumber, delta)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            accessibilityLabel={labelFor(delta)}
            accessibilityHint={`Tap to change ${identity}'s life by ${delta}. Long press to enter a custom amount.`}
            accessibilityActions={[
              {
                name: "longpress",
                label: `${identity}, ${delta > 0 ? "add" : "subtract"} a custom amount`,
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
              longPressHandled.current = delta
              onLongChange?.(delta)
            }}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === "longpress") onLongChange?.(delta)
            }}
            onPress={() => {
              if (longPressHandled.current === delta) {
                longPressHandled.current = null
                return
              }
              onChange(delta)
            }}
          >
            <Text
              text={glyph}
              maxFontSizeMultiplier={1.3}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[
                themed(compact ? $compactGlyph : $glyph),
                contentRotationStyle,
                { color: foreground },
              ]}
            />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const $zones: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  flexDirection: "row",
})
const $zonesFacingLeft: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  flexDirection: "column",
})
const $zonesFacingRight: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  flexDirection: "column-reverse",
})

const $zone: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
})

const $zoneLeft: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-start" })
const $zoneRight: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-end" })
const $zoneSideways: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingHorizontal: 0,
  paddingVertical: spacing.sm,
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
