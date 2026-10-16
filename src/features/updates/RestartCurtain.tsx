import type { ImageStyle, ViewStyle } from "react-native"
import { Image } from "react-native"
import Animated, { FadeIn } from "react-native-reanimated"

import { LAUNCH_MARK, LAUNCH_MARK_SIZE } from "@/features/launch/LaunchFallback"
import { translate } from "@/i18n/translate"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { RESTART_FADE_MS, useRestarting } from "./appUpdate"

const CURTAIN_ENTERING = FadeIn.duration(RESTART_FADE_MS)

export function RestartCurtain() {
  const restarting = useRestarting()
  const reducedMotion = useReducedMotion()
  if (!restarting) return null
  const label = translate("account:updates.restarting")
  return (
    <Animated.View
      testID="restart-curtain"
      accessibilityLabel={label}
      entering={reducedMotion === false ? CURTAIN_ENTERING : undefined}
      style={$curtain}
    >
      <Image
        source={LAUNCH_MARK}
        resizeMode="contain"
        style={$mark}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  )
}

const $curtain: ViewStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 100,
  elevation: 100,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#000000",
}
const $mark: ImageStyle = { width: LAUNCH_MARK_SIZE, height: LAUNCH_MARK_SIZE }
