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

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

const PROGRESS_SEGMENT_RATIO = 0.28
const PROGRESS_TRAVEL_MS = 1100
const PROGRESS_COMPLETE_MS = 180

export type LoadingProgressState = "loading" | "complete" | "unavailable"

export function LoadingProgress({
  state,
  accessibilityText,
  testID = "loading-progress",
  edge,
}: {
  state: LoadingProgressState
  accessibilityText: string
  testID?: string
  edge?: "top" | "bottom"
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const trackWidth = useSharedValue(0)
  const travel = useSharedValue(0)
  const completion = useSharedValue(0)
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
      style={[themed($progressTrack), edge && themed(edge === "top" ? $edgeTop : $edgeBottom)]}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width
      }}
    >
      <Animated.View style={[themed($progressSegment), segmentStyle]} />
      <Animated.View style={[themed($progressComplete), completionStyle]} />
    </View>
  )
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
const $edgeTop: ViewStyle = {
  marginTop: 0,
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  backgroundColor: "transparent",
}
const $edgeBottom: ViewStyle = {
  marginTop: 0,
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: "transparent",
}
