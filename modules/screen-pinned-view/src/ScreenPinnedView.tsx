import type { ComponentType } from "react"
import { View } from "react-native"
import { requireNativeView, requireOptionalNativeModule } from "expo"

import type { ScreenPinnedMetrics, ScreenPinnedViewProps } from "./ScreenPinnedView.types"

type NativeScreenPinnedViewProps = Omit<ScreenPinnedViewProps, "onOrientationChange"> & {
  onOrientationChange?: (event: { nativeEvent: ScreenPinnedMetrics }) => void
}

/** why: false in binaries built before the module existed, where callers keep their non-pinned path. */
export const SCREEN_PINNING_AVAILABLE = requireOptionalNativeModule("ScreenPinnedView") !== null

const NativeScreenPinnedView: ComponentType<NativeScreenPinnedViewProps> | null =
  SCREEN_PINNING_AVAILABLE ? requireNativeView("ScreenPinnedView") : null

/** why: children mount into a native rotor that stays fixed to the screen hardware while the OS rotates the window, so lay them out at the reported metrics size while pinned. */
export function ScreenPinnedView({ onOrientationChange, ...props }: ScreenPinnedViewProps) {
  if (!NativeScreenPinnedView) return <View {...props} />
  return (
    <NativeScreenPinnedView
      {...props}
      onOrientationChange={
        onOrientationChange && ((event) => onOrientationChange(event.nativeEvent))
      }
    />
  )
}
