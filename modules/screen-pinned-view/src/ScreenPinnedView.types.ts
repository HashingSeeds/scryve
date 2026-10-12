import type { ViewProps } from "react-native"

export interface ScreenPinnedInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ScreenPinnedMetrics {
  pinned: boolean
  holderAngle: number
  width: number
  height: number
  insets: ScreenPinnedInsets
}

export interface ScreenPinnedViewProps extends ViewProps {
  onOrientationChange?: (metrics: ScreenPinnedMetrics) => void
}
