import { useEffect } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

const PROGRESS_SEGMENT_RATIO = 0.28
const PROGRESS_TRAVEL_MS = 1100
const PROGRESS_COMPLETE_MS = 180

export type DeckLoadingProgressState = "loading" | "complete" | "unavailable"

export function DeckLoadingProgress({
  state,
  accessibilityText,
  testID = "deck-loading-progress",
}: {
  state: DeckLoadingProgressState
  accessibilityText: string
  testID?: string
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const trackWidth = useSharedValue(0)
  const travel = useSharedValue(0)
  const completion = useSharedValue(state === "complete" ? 1 : 0)
  const loading = state === "loading"

  useEffect(() => {
    cancelAnimation(travel)
    cancelAnimation(completion)
    if (loading) {
      completion.value = 0
      travel.value = 0
      if (reducedMotion === false)
        travel.value = withRepeat(
          withTiming(1, {
            duration: PROGRESS_TRAVEL_MS,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true,
        )
    } else {
      travel.value = 0
      completion.value =
        state === "complete"
          ? withTiming(1, { duration: motionDuration(reducedMotion, PROGRESS_COMPLETE_MS) })
          : 0
    }
    return () => {
      cancelAnimation(travel)
      cancelAnimation(completion)
    }
  }, [completion, loading, reducedMotion, state, travel])

  const segmentStyle = useAnimatedStyle(
    () => ({
      opacity: loading ? 1 : 0,
      transform: [{ translateX: travel.value * trackWidth.value * (1 - PROGRESS_SEGMENT_RATIO) }],
    }),
    [loading],
  )
  const completionStyle = useAnimatedStyle(() => ({
    width: trackWidth.value * completion.value,
  }))

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ text: accessibilityText }}
      style={themed($progressTrack)}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width
      }}
    >
      <Animated.View style={[themed($progressSegment), segmentStyle]} />
      <Animated.View style={[themed($progressComplete), completionStyle]} />
    </View>
  )
}

export function DeckListSkeleton({
  sections,
  density = "compact",
}: {
  sections: readonly { id: string; label: string }[]
  density?: "compact" | "comfortable"
}) {
  const { themed } = useAppTheme()
  const visibleSections =
    sections.length > 0 ? sections.slice(0, 2) : [{ id: "cards", label: "Cards" }]
  const rowStyle = density === "comfortable" ? $comfortableRow : $compactRow
  const thumbnailStyle = density === "comfortable" ? $comfortableThumbnail : $compactThumbnail

  return visibleSections.map((section, sectionIndex) => (
    <View key={section.id}>
      <View style={themed($sectionHeader)}>
        <Text weight="bold" text={section.label} />
      </View>
      {Array.from({ length: sectionIndex === 0 ? 1 : 3 }).map((_, index) => (
        <View key={index} style={[themed($row), rowStyle]}>
          <View style={[themed($thumbnail), thumbnailStyle]} />
          <View style={themed($line)} />
        </View>
      ))}
    </View>
  ))
}

const $progressTrack: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: 3,
  marginTop: spacing.sm,
  overflow: "hidden",
  backgroundColor: colors.separator,
})
const $progressSegment: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 0,
  width: `${PROGRESS_SEGMENT_RATIO * 100}%`,
  height: "100%",
  backgroundColor: colors.tint,
})
const $progressComplete: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 0,
  height: "100%",
  backgroundColor: colors.tint,
})
const $sectionHeader: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingTop: spacing.md,
  paddingBottom: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $compactRow = { minHeight: 68 } as const
const $comfortableRow = { minHeight: 84 } as const
const $thumbnail: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: spacing.xxxs,
  backgroundColor: colors.separator,
})
const $compactThumbnail = { width: 36, height: 50 } as const
const $comfortableThumbnail = { width: 48, height: 68 } as const
const $line: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "64%",
  height: 14,
  backgroundColor: colors.separator,
})
