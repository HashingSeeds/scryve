import { type SharedValue, useAnimatedStyle } from "react-native-reanimated"

import type { LifeCardContentRotation } from "./playerCardTypes"

export type LiveCardSize = SharedValue<{ width: number; height: number }>

/** why: content layers take their size from the card, turned sideways or not, and while a transition resizes the card on the UI thread the measured size trails it, so the layer follows the live size instead. */
export function useLiveContentFrame(rotation: LifeCardContentRotation, liveSize?: LiveCardSize) {
  return useAnimatedStyle(() => {
    if (!liveSize) return {}
    const { width, height } = liveSize.value
    return Math.abs(rotation) === 90
      ? { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2 }
      : { width, height, left: 0, top: 0 }
  })
}
