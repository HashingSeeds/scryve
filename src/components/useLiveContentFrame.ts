import { type SharedValue, useAnimatedStyle } from "react-native-reanimated"

import type { LifeCardContentRotation } from "./playerCardTypes"

export type LiveCardSize = SharedValue<{ width: number; height: number }>

/** why: a layer turned sideways swaps its sides inside the card, and while a transition resizes the card on the UI thread the measured size trails it, so the layer follows the live size instead. */
export function useLiveContentFrame(rotation: LifeCardContentRotation, liveSize?: LiveCardSize) {
  return useAnimatedStyle(() => {
    if (!liveSize || Math.abs(rotation) !== 90) return {}
    const { width, height } = liveSize.value
    return { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2 }
  })
}
