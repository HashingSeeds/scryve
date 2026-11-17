import { Platform, type ViewStyle } from "react-native"

import { appDirection, isRTL } from "@/i18n"

// why: native lays out by the `direction` style and react-native-web by the `dir` prop, so a scope sets both: <View dir="ltr" style={$tableDirection}>.

/** why: seats sit where players sit, so the board and seat diagrams keep physical left and right. */
export const $tableDirection: ViewStyle = { direction: "ltr" }

/** why: a dialog or sheet opened from a seat inherits the board's direction unless its root resets it. */
export const $appDirection: ViewStyle = { direction: appDirection }

// why: native swaps left and right styles in RTL, so measured positions and safe-area insets, which are physical, go through these.
export const startEdge = isRTL ? "right" : "left"
export const endEdge = isRTL ? "left" : "right"
export const towardEnd = isRTL ? -1 : 1

export function startFromLeft(left: number, width: number, parentWidth: number) {
  return isRTL ? parentWidth - left - width : left
}

// why: native aligns "left" and "right" text to start and end in RTL; react-native-web keeps them physical.
export const textStart = Platform.OS === "web" && isRTL ? "right" : "left"
export const textEnd = Platform.OS === "web" && isRTL ? "left" : "right"

declare module "react-native" {
  interface ViewProps {
    dir?: "ltr" | "rtl"
  }
}
