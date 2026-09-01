import { useEffect, useState } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { Text } from "./Text"

export function AppUtilityMenu({
  visible = true,
  onSettings,
  onAccount,
  accountLabel = "Account",
}: {
  visible?: boolean
  onSettings: () => void
  onAccount: () => void
  accountLabel?: "Account" | "Sign in"
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(reducedMotion, 180),
    })
  }, [open, progress, reducedMotion])

  const containerStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [92, 188]),
    height: interpolate(progress.value, [0, 1], [44, 108]),
  }))
  const triggerStyle = useAnimatedStyle(() => ({ opacity: progress.value < 0.05 ? 1 : 0 }))
  const itemsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], "clamp"),
  }))

  if (!visible) return null
  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <View pointerEvents="box-none" style={$slot}>
      {open ? (
        <Pressable
          testID="utility-menu-backdrop"
          accessibilityLabel="Close utility menu"
          style={$backdrop}
          onPress={() => setOpen(false)}
        />
      ) : null}
      <Animated.View testID="utility-menu" style={[themed($menu), containerStyle]}>
        <Animated.View pointerEvents={open ? "none" : "auto"} style={[$fill, triggerStyle]}>
          <Pressable
            testID="utility-menu-button"
            accessibilityRole="button"
            accessibilityLabel="Utility"
            accessibilityState={{ expanded: open }}
            style={themed($trigger)}
            onPress={() => setOpen(true)}
          >
            <Text text="Utility" weight="bold" size="xs" />
          </Pressable>
        </Animated.View>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={[$fill, themed($items), itemsStyle]}
        >
          <Pressable
            testID="utility-settings-button"
            accessibilityRole="button"
            style={themed($item)}
            onPress={() => choose(onSettings)}
          >
            <Text text="Settings" weight="medium" />
          </Pressable>
          <Pressable
            testID="utility-account-button"
            accessibilityRole="button"
            style={themed($item)}
            onPress={() => choose(onAccount)}
          >
            <Text text={accountLabel} weight="medium" />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const $slot: ViewStyle = { width: 92, height: 44, zIndex: 80 }
const $backdrop: ViewStyle = {
  position: "absolute",
  top: -1000,
  right: -1000,
  bottom: -1000,
  left: -1000,
}
const $fill: ViewStyle = { ...StyleSheet.absoluteFill }
const $menu: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  right: 0,
  top: 0,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.background,
})
const $trigger: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
})
const $items: ThemedStyle<ViewStyle> = () => ({ justifyContent: "center" })
const $item: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.separator,
})
