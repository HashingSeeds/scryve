import { Pressable, StyleSheet, View, type ViewStyle } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated"

import { Icon } from "@/components/Icon"

import {
  PRETEND_CLOSES_AT_DEG,
  PRETEND_OPENS_AT_DEG,
  pretendHingeAngle,
  setPretendDuo,
  setPretendDuoOpen,
  usePretendDuo,
} from "./pretendDuo"

const TRACK = 320
const THUMB = 28

export function PretendHingeSlider() {
  const drag = Gesture.Pan()
    .minDistance(0)
    .onBegin(({ x }) => pretendHingeAngle.set(angleAt(x)))
    .onUpdate(({ x }) => pretendHingeAngle.set(angleAt(x)))
  const open = useSharedValue(usePretendDuo().open)
  useAnimatedReaction(
    () => pretendHingeAngle.value,
    (angle, before) => {
      const opening = before === null || angle > before
      const next = open.value
        ? !(angle < PRETEND_CLOSES_AT_DEG && !opening)
        : angle >= PRETEND_OPENS_AT_DEG && opening
      if (next === open.value) return
      open.set(next)
      runOnJS(setPretendDuoOpen)(next)
    },
  )
  const fill = useAnimatedStyle(() => ({ width: (pretendHingeAngle.value / 180) * TRACK }))

  return (
    <View testID="pretend-hinge" style={$bar}>
      <GestureDetector gesture={drag}>
        <View style={$track}>
          <Animated.View style={[$fill, fill]} />
        </View>
      </GestureDetector>
      <Pressable
        testID="pretend-duo-stop"
        accessibilityRole="button"
        onPress={() => setPretendDuo(false)}
        hitSlop={12}
      >
        <Icon icon="x" color="#FFF" size={20} />
      </Pressable>
    </View>
  )
}

function angleAt(x: number) {
  "worklet"
  return Math.round(Math.min(Math.max(x / TRACK, 0), 1) * 180)
}

const $bar: ViewStyle = {
  position: "absolute",
  left: 16,
  top: 32,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  padding: 8,
  borderRadius: THUMB,
  backgroundColor: "rgba(0,0,0,0.7)",
}

const $track: ViewStyle = {
  width: TRACK,
  height: THUMB,
  borderRadius: THUMB / 2,
  overflow: "hidden",
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "#FFF",
}

const $fill: ViewStyle = { height: "100%", backgroundColor: "#FFD60A" }
