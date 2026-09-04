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
  compact = false,
  placement = "topRight",
  onSettings,
  onAccount,
  onOpenChange,
  accountLabel = "Account",
}: {
  visible?: boolean
  compact?: boolean
  placement?: "topRight" | "bottomLeft"
  onSettings: () => void
  onAccount: () => void
  onOpenChange?: (open: boolean) => void
  accountLabel?: "Account" | "Sign in"
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (!visible) {
      setOpen(false)
      onOpenChange?.(false)
    }
  }, [onOpenChange, visible])

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(reducedMotion, 180),
    })
  }, [open, progress, reducedMotion])

  const containerStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [compact ? 44 : 92, compact ? 148 : 188]),
    height: interpolate(progress.value, [0, 1], [44, 108]),
    borderRadius: compact ? interpolate(progress.value, [0, 1], [22, 16]) : 0,
  }))
  const triggerStyle = useAnimatedStyle(() => ({ opacity: progress.value < 0.05 ? 1 : 0 }))
  const itemsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], "clamp"),
  }))

  if (!visible) return null
  const close = () => {
    setOpen(false)
    onOpenChange?.(false)
  }
  const choose = (action: () => void) => {
    close()
    action()
  }
  const slotStyle = open ? (compact ? $expandedCompactSlot : $expandedSlot) : undefined

  return (
    <Animated.View
      testID="utility-menu-slot"
      pointerEvents="box-none"
      style={[compact ? $compactSlot : $slot, slotStyle]}
    >
      {open ? (
        <Pressable
          testID="utility-menu-backdrop"
          accessibilityLabel="Close utility menu"
          style={$backdrop}
          onPress={close}
        />
      ) : null}
      <Animated.View
        testID="utility-menu"
        style={[
          themed($menu),
          placement === "bottomLeft" ? $bottomLeft : $topRight,
          containerStyle,
        ]}
      >
        <Animated.View
          pointerEvents={open ? "none" : "auto"}
          accessibilityElementsHidden={open}
          importantForAccessibility={open ? "no-hide-descendants" : "auto"}
          style={[$fill, triggerStyle]}
        >
          <Pressable
            testID="utility-menu-button"
            accessibilityRole="button"
            accessibilityLabel="Utility"
            accessibilityState={{ expanded: open }}
            style={themed($trigger)}
            onPress={() => {
              setOpen(true)
              onOpenChange?.(true)
            }}
          >
            {compact ? (
              <View testID="utility-menu-dots" accessible={false} style={$dotsRow}>
                <View style={themed($dot)} />
                <View style={themed($dot)} />
                <View style={themed($dot)} />
              </View>
            ) : (
              <Text text="Utility" weight="bold" size="xs" />
            )}
          </Pressable>
        </Animated.View>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
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
    </Animated.View>
  )
}

const $slot: ViewStyle = { width: 92, height: 44, zIndex: 80 }
const $compactSlot: ViewStyle = { width: 44, height: 44, zIndex: 80 }
const $expandedSlot: ViewStyle = { width: 188, height: 108 }
const $expandedCompactSlot: ViewStyle = { width: 148, height: 108 }
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
  overflow: "hidden",
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.background,
})
const $topRight: ViewStyle = { right: 0, top: 0 }
const $bottomLeft: ViewStyle = { bottom: 0, left: 0 }
const $trigger: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
})
const $dotsRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
}
const $dot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 5,
  height: 5,
  borderRadius: 2.5,
  backgroundColor: colors.text,
})
const $items: ThemedStyle<ViewStyle> = () => ({ justifyContent: "center" })
const $item: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.separator,
})
