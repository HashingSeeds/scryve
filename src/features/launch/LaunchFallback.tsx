import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, Image, View } from "react-native"
// eslint-disable-next-line no-restricted-imports
import { Text as NativeText } from "react-native"

import { translate } from "@/i18n/translate"

export const LAUNCH_MARK: number = require("../../../assets/images/app-icon-android-adaptive-foreground.png")

export function LaunchFallback() {
  const starting = translate("account:launch.starting")
  const startingLabel = translate("account:launch.startingAccessibilityLabel")
  return (
    <View testID="launch-fallback" style={$screen}>
      <Image
        source={LAUNCH_MARK}
        resizeMode="contain"
        style={$mark}
        accessibilityIgnoresInvertColors
      />
      <View accessibilityRole="progressbar" accessibilityLabel={startingLabel} style={$status}>
        <ActivityIndicator color="#FFFFFF" size="small" />
        <NativeText style={$statusText}>{starting}</NativeText>
      </View>
    </View>
  )
}

const $screen: ViewStyle = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#000000",
}
export const LAUNCH_MARK_SIZE = 300
const $mark: ImageStyle = { width: LAUNCH_MARK_SIZE, height: LAUNCH_MARK_SIZE }
const $status: ViewStyle = {
  position: "absolute",
  bottom: 48,
  minHeight: 40,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
}
const $statusText: TextStyle = {
  color: "#FFFFFF",
  fontFamily: "System",
  fontSize: 14,
  lineHeight: 20,
}
