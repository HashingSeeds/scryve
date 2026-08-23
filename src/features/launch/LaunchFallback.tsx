import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, Image, View } from "react-native"
// eslint-disable-next-line no-restricted-imports
import { Text as NativeText } from "react-native"

const launchMark = require("../../../assets/images/app-icon-android-adaptive-foreground.png")

export function LaunchFallback() {
  return (
    <View testID="launch-fallback" style={$screen}>
      <Image
        source={launchMark}
        resizeMode="contain"
        style={$mark}
        accessibilityIgnoresInvertColors
      />
      <View accessibilityRole="progressbar" accessibilityLabel="Starting Scryve" style={$status}>
        <ActivityIndicator color="#FFFFFF" size="small" />
        <NativeText style={$statusText}>Starting Scryve…</NativeText>
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
const $mark: ImageStyle = { width: 300, height: 300 }
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
