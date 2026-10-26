import { type ReactNode, useMemo } from "react"
import { useWindowDimensions, View, type ViewStyle } from "react-native"

import type { PlayerGridProps } from "@/components/PlayerGrid"

import { PretendHingeSlider } from "./PretendHingeSlider"

/** why: a closed Duo shows only its outer display, which folds over the right half of the open device, so the pretend one draws the board there and leaves the rest dark. */
export function PretendClosedDuo({
  renderGrid,
  testID,
}: {
  renderGrid: (boardOrientation: PlayerGridProps["boardOrientation"]) => ReactNode
  testID: string
}) {
  const window = useWindowDimensions()
  const outer = { width: Math.min(window.width / 2, window.height), height: window.height }
  const boardOrientation = useMemo(
    () => ({
      width: outer.width,
      height: outer.height,
      screenWidth: outer.width,
      screenHeight: outer.height,
      fontScale: window.fontScale,
      rotation: 0,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      touchRotation: 0,
    }),
    [outer.width, outer.height, window.fontScale],
  )
  return (
    <View testID={testID} style={$dark}>
      <View style={[$outerDisplay, outer]}>{renderGrid(boardOrientation)}</View>
      <PretendHingeSlider />
    </View>
  )
}

const $dark: ViewStyle = { flex: 1, width: "100%", backgroundColor: "#000" }

const $outerDisplay: ViewStyle = { position: "absolute", right: 0, top: 0 }
