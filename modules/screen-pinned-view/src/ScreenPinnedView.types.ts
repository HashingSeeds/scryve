import type { ViewProps } from "react-native"

export interface ScreenPinnedInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** why: sent on attach, after each rotation, and when pinning turns on or off (split view, multi-window). While pinned, width and height are the hardware portrait size, insets are in that space, and holderAngle (0, 90, 180 or -90, clockwise) turns pinned content to read upright for the holder. Unpinned children should fill the host instead. */
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
