import { View } from "react-native"

import type { ScreenPinnedViewProps } from "./ScreenPinnedView.types"

export const SCREEN_PINNING_AVAILABLE = false

export function ScreenPinnedView({ onOrientationChange: _, ...props }: ScreenPinnedViewProps) {
  return <View {...props} />
}
