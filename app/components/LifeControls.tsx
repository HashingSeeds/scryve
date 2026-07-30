import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"

import type { LifeDelta } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

export interface LifeControlsProps {
  playerName: string
  seatNumber?: number
  disabled?: boolean
  contrastCheckedForeground?: string
  compact?: boolean
  onChange: (delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

const HALF_CARD_ZONES: readonly { delta: LifeDelta; glyph: string; edge: "left" | "right" }[] = [
  { delta: -1, glyph: "−", edge: "left" },
  { delta: 1, glyph: "+", edge: "right" },
]
const CORNER_PILLS: readonly { delta: LifeDelta; label: string }[] = [
  { delta: -5, label: "−5" },
  { delta: 5, label: "+5" },
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
  onChange,
  style,
}: LifeControlsProps) {
  const { themed } = useAppTheme()
  const displayName = playerName.trim() || "unnamed player"
  const identity = `Seat ${seatNumber}, ${displayName}`

  function labelFor(delta: LifeDelta) {
    return `${identity}, ${delta > 0 ? "add" : "subtract"} ${Math.abs(delta)} life`
  }

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]}>
      <View pointerEvents="box-none" style={themed($zones)}>
        {HALF_CARD_ZONES.map(({ delta, glyph, edge }) => (
          <Pressable
            key={delta}
            testID={lifeControlTestId(seatNumber, delta)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            accessibilityLabel={labelFor(delta)}
            accessibilityHint={`Changes ${identity}'s life total by ${delta}`}
            style={({ pressed }) => [
              themed($zone),
              edge === "left" ? themed($zoneLeft) : themed($zoneRight),
              pressed && !disabled && { backgroundColor: overlayTint(foreground, 0.14) },
            ]}
            onPress={() => onChange(delta)}
          >
            <Text
              text={glyph}
              maxFontSizeMultiplier={1.3}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[themed(compact ? $compactGlyph : $glyph), { color: foreground }]}
            />
          </Pressable>
        ))}
      </View>
      <View pointerEvents="box-none" style={themed($pillRow)}>
        {CORNER_PILLS.map(({ delta, label }) => (
          <Pressable
            key={delta}
            testID={lifeControlTestId(seatNumber, delta)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            accessibilityLabel={labelFor(delta)}
            accessibilityHint={`Changes ${identity}'s life total by ${delta}`}
            style={({ pressed }) => [
              themed($pill),
              compact && themed($compactPill),
              {
                backgroundColor: overlayTint(foreground, pressed && !disabled ? 0.28 : 0.14),
                borderColor: overlayTint(foreground, 0.24),
              },
            ]}
            onPress={() => onChange(delta)}
          >
            <Text
              text={label}
              weight="medium"
              maxFontSizeMultiplier={1.3}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[themed($pillText), { color: foreground }]}
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

const $zone: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
})

const $zoneLeft: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-start" })
const $zoneRight: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-end" })

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

const $pillRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  flexDirection: "row",
  justifyContent: "space-between",
  padding: spacing.xs,
})

const $pill: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 52,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
  borderRadius: spacing.lg,
  borderWidth: 1,
})

const $compactPill: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 44,
  paddingHorizontal: spacing.xxs,
})

const $pillText: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  lineHeight: 19,
})
