import { useState } from "react"
import type { LayoutChangeEvent, TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { CHOICE_RADIUS } from "./ChoiceButton"
import { Text } from "./Text"

export interface Segment {
  id: string
  label: string
}

export interface SegmentedControlProps {
  segments: readonly Segment[]
  selectedId: string
  accessibilityLabel?: string
  testID?: string
  onSelect: (id: string) => void
}

const TRACK_INSET = 3
const TRACK_BORDER_WIDTH = 1
const SLIDE_SPRING = { damping: 18, stiffness: 240, mass: 0.6 } as const

export function SegmentedControl({
  segments,
  selectedId,
  accessibilityLabel,
  testID,
  onSelect,
}: SegmentedControlProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)
  const offset = useSharedValue(0)
  const selectedIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.id === selectedId),
  )
  const segmentWidth = segments.length > 0 ? trackWidth / segments.length : 0
  const accent = colors.tint

  function measureTrack(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width - (TRACK_INSET + TRACK_BORDER_WIDTH) * 2
    setTrackWidth(width)
    offset.value = (width / segments.length) * selectedIndex
  }

  function select(id: string, index: number) {
    if (segmentWidth > 0) {
      const target = segmentWidth * index
      offset.value = reducedMotion === false ? withSpring(target, SLIDE_SPRING) : target
    }
    if (id !== selectedId) onSelect(id)
  }

  const $thumb = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={themed($track)}
      onLayout={measureTrack}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[themed($thumbShape), { width: segmentWidth, backgroundColor: accent }, $thumb]}
        />
      ) : null}
      {segments.map((segment, index) => {
        const selected = segment.id === selectedId
        return (
          <Pressable
            key={segment.id}
            testID={testID ? `${testID}-${segment.id}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={themed($segment)}
            onPress={() => select(segment.id, index)}
          >
            <Text
              text={segment.label}
              size="xs"
              weight="medium"
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={[
                themed($segmentLabel),
                { color: selected ? accessibleForeground(accent) : colors.text },
              ]}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const $track: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "row",
  padding: TRACK_INSET,
  borderRadius: CHOICE_RADIUS,
  borderWidth: TRACK_BORDER_WIDTH,
  borderColor: colors.border,
  backgroundColor: colors.palette.neutral100,
})
const $thumbShape: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: TRACK_INSET,
  bottom: TRACK_INSET,
  left: TRACK_INSET,
  borderRadius: CHOICE_RADIUS - TRACK_INSET,
})
const $segment: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minHeight: 46,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
})
const $segmentLabel: ThemedStyle<TextStyle> = () => ({ textAlign: "center" })
