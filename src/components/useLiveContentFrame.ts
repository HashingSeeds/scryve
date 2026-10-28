import { type SharedValue, useAnimatedStyle } from "react-native-reanimated"

import type { LifeCardContentRotation } from "./playerCardTypes"

export type LiveCardSize = SharedValue<{ width: number; height: number }>

/** why: content layers take their size from the card, turned sideways or not, and while a transition resizes the card on the UI thread the measured size trails it, so the layer follows the live size instead. A seat stays mounted when its transition ends, so the style always sets every key; one it dropped would keep its last live value. */
export function useLiveContentFrame(
  rotation: LifeCardContentRotation,
  measured: { width: number; height: number },
  liveSize?: LiveCardSize,
) {
  return useAnimatedStyle(() => {
    const sideways = Math.abs(rotation) === 90
    // why: a percentage size resolves inside the card's padding while left and top start at its edge, which shrank the layer by the padding and pinned it to the top left; the measured size fills the card.
    const { width, height } = liveSize ? liveSize.value : measured
    return sideways
      ? { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2 }
      : { width, height, left: 0, top: 0 }
  })
}
