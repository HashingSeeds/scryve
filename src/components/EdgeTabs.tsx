import { createContext } from "react"
import type { ViewStyle } from "react-native"
import { Easing, Keyframe, ReduceMotion } from "react-native-reanimated"

import { EDGE_TAB } from "./playerGridGeometry"

export type BoardEdge = "left" | "right" | "top" | "bottom"

export interface EdgeTab {
  edge: BoardEdge
  at: number
  facing: number
}

const { depth: TAB_DEPTH } = EDGE_TAB
/** why: seats beside a tab step their corner chrome past it only while the tabs show, then slide back. */
export const EdgeTabsShownContext = createContext(false)
const TAB_ENTER_DELAY_MS = 260
const TAB_SLIDE_MS = 200

/** why: Reanimated reads reduced motion only at startup, so the live preference gates these animations instead. */
function edgeSlides(edge: BoardEdge) {
  const tuckedBy = (share: number) => ({
    transform: [
      { translateX: (edge === "left" ? -TAB_DEPTH : edge === "right" ? TAB_DEPTH : 0) * share },
      { translateY: (edge === "top" ? -TAB_DEPTH : edge === "bottom" ? TAB_DEPTH : 0) * share },
    ],
  })
  return {
    // why: web keyframes only take named ease-in curves, so the ease-out is drawn as a midpoint: an ease-out quad has three quarters of the way behind it halfway through.
    entering: new Keyframe({ 0: tuckedBy(1), 50: tuckedBy(0.25), 100: tuckedBy(0) })
      .delay(TAB_ENTER_DELAY_MS)
      .duration(TAB_SLIDE_MS)
      .reduceMotion(ReduceMotion.Never),
    exiting: new Keyframe({ 0: tuckedBy(0), 100: { ...tuckedBy(1), easing: Easing.quad } })
      .duration(TAB_SLIDE_MS)
      .reduceMotion(ReduceMotion.Never),
  }
}

export const EDGE_SLIDES = {
  left: edgeSlides("left"),
  right: edgeSlides("right"),
  top: edgeSlides("top"),
  bottom: edgeSlides("bottom"),
} satisfies Record<BoardEdge, ReturnType<typeof edgeSlides>>

export function edgeStyle(
  { edge, at }: EdgeTab,
  { length: TAB_LENGTH, depth: TAB_DEPTH }: { length: number; depth: number },
): ViewStyle {
  const RADIUS = TAB_DEPTH / 2
  const along = `${at * 100}%` as const
  switch (edge) {
    case "left":
      return {
        left: 0,
        top: along,
        marginTop: -TAB_LENGTH / 2,
        width: TAB_DEPTH,
        height: TAB_LENGTH,
        borderLeftWidth: 0,
        borderTopRightRadius: RADIUS,
        borderBottomRightRadius: RADIUS,
      }
    case "right":
      return {
        right: 0,
        top: along,
        marginTop: -TAB_LENGTH / 2,
        width: TAB_DEPTH,
        height: TAB_LENGTH,
        borderRightWidth: 0,
        borderTopLeftRadius: RADIUS,
        borderBottomLeftRadius: RADIUS,
      }
    case "top":
      return {
        top: 0,
        left: along,
        marginLeft: -TAB_LENGTH / 2,
        width: TAB_LENGTH,
        height: TAB_DEPTH,
        borderTopWidth: 0,
        borderBottomLeftRadius: RADIUS,
        borderBottomRightRadius: RADIUS,
      }
    case "bottom":
      return {
        bottom: 0,
        left: along,
        marginLeft: -TAB_LENGTH / 2,
        width: TAB_LENGTH,
        height: TAB_DEPTH,
        borderBottomWidth: 0,
        borderTopLeftRadius: RADIUS,
        borderTopRightRadius: RADIUS,
      }
  }
}
