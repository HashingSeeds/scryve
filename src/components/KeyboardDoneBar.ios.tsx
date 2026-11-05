import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { KeyboardController, KeyboardExtender } from "react-native-keyboard-controller"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

// why: an iOS keyboard has no dismiss key, and search screens leave nothing safe to tap away on. Mounted once, this rides above every focused input, sheets included.
export function KeyboardDoneBar() {
  const { themed } = useAppTheme()
  return (
    // why: the extender keeps its layout box where it is mounted, so park it below the screen or it shrinks every screen.
    <View style={$offscreen}>
      <KeyboardExtender>
        <Pressable
          testID="keyboard-done"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => KeyboardController.dismiss()}
          style={themed($button)}
        >
          <Text tx="common:done" weight="semiBold" style={themed($label)} />
        </Pressable>
      </KeyboardExtender>
    </View>
  )
}

const $offscreen: ViewStyle = { position: "absolute", top: "100%", left: 0, right: 0 }

const $button: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-end",
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
})

const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
