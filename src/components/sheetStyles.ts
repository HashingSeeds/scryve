import type { ViewStyle } from "react-native"

// why: a ScrollView grows to fill by default, which stretches a "fit" Sheet to its maximum height.
export const $sheetScroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
