import { Pressable, useWindowDimensions, View, type TextStyle, type ViewStyle } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { Icon } from "@/components/Icon"
import { Text } from "@/components/Text"

import {
  PRETEND_CLOSES_AT_DEG,
  PRETEND_OPENS_AT_DEG,
  pretendHingeAngle,
  setPretendDuo,
  setPretendDuoOpen,
  usePretendDuo,
} from "./pretendDuo"

const THUMB = 36
const EDGE = 48
// why: a little slower than a hand opens a Duo, since a dev build's switch between displays stalls long enough to hide a real-speed unfold.
const FULL_SWING_MS = 2000

/** why: sits in the left half, which a closed Duo leaves dark, clear of the screen edges whose swipes open Notification Center and the app switcher. Only the thumb drags, so a stray tap cannot jump the hinge; Open and Close play the same motion every time. */
export function PretendHingeSlider() {
  const window = useWindowDimensions()
  const track = Math.max(window.width / 2 - EDGE * 2, 200)
  const dragFrom = useSharedValue(0)
  const drag = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      cancelAnimation(pretendHingeAngle)
      dragFrom.set(pretendHingeAngle.value)
    })
    .onUpdate(({ translationX }) =>
      pretendHingeAngle.set(clampAngle(dragFrom.value + (translationX / track) * 180)),
    )
  const swing = (to: number) => {
    const from = pretendHingeAngle.get()
    pretendHingeAngle.set(
      withTiming(to, {
        duration: (Math.abs(to - from) / 180) * FULL_SWING_MS,
        easing: Easing.inOut(Easing.cubic),
      }),
    )
  }
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
  const fill = useAnimatedStyle(() => ({ width: (pretendHingeAngle.value / 180) * track }))
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: (pretendHingeAngle.value / 180) * track - THUMB / 2 }],
  }))

  return (
    <View testID="pretend-hinge" pointerEvents="box-none" style={[$panel, { width: track }]}>
      <View style={[$track, { width: track }]}>
        <View style={[$rail, { width: track }]} />
        <Animated.View style={[$fill, fill]} />
        <View style={[$mark, { left: (PRETEND_OPENS_AT_DEG / 180) * track }]} />
        <View style={[$mark, { left: (PRETEND_CLOSES_AT_DEG / 180) * track }]} />
        <GestureDetector gesture={drag}>
          <Animated.View testID="pretend-hinge-thumb" hitSlop={16} style={[$thumb, thumb]} />
        </GestureDetector>
      </View>
      <View style={$buttons}>
        <Pressable testID="pretend-duo-close" style={$button} onPress={() => swing(0)}>
          <Text text="Close" weight="semiBold" style={$label} />
        </Pressable>
        <Pressable testID="pretend-duo-open" style={$button} onPress={() => swing(180)}>
          <Text text="Open" weight="semiBold" style={$label} />
        </Pressable>
        <Pressable
          testID="pretend-duo-stop"
          accessibilityRole="button"
          onPress={() => setPretendDuo(false)}
          hitSlop={12}
        >
          <Icon icon="x" color="#FFF" size={20} />
        </Pressable>
      </View>
    </View>
  )
}

function clampAngle(angle: number) {
  "worklet"
  return Math.min(Math.max(angle, 0), 180)
}

const $panel: ViewStyle = {
  position: "absolute",
  left: EDGE,
  top: 96,
  gap: 16,
  padding: 12,
  borderRadius: 16,
  backgroundColor: "rgba(0,0,0,0.7)",
  boxSizing: "content-box",
}

const $track: ViewStyle = {
  height: THUMB,
  justifyContent: "center",
}

const $rail: ViewStyle = {
  position: "absolute",
  left: 0,
  height: 6,
  borderRadius: 3,
  backgroundColor: "rgba(255,255,255,0.25)",
}

const $fill: ViewStyle = {
  position: "absolute",
  left: 0,
  height: 6,
  borderRadius: 3,
  backgroundColor: "#FFD60A",
}

const $mark: ViewStyle = {
  position: "absolute",
  width: 2,
  height: 14,
  marginLeft: -1,
  backgroundColor: "rgba(255,255,255,0.5)",
}

const $thumb: ViewStyle = {
  position: "absolute",
  left: 0,
  width: THUMB,
  height: THUMB,
  borderRadius: THUMB / 2,
  backgroundColor: "#FFF",
}

const $buttons: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 12 }

const $button: ViewStyle = {
  paddingHorizontal: 20,
  paddingVertical: 10,
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.15)",
}

const $label: TextStyle = { color: "#FFF" }
