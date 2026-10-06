import { Platform, useWindowDimensions } from "react-native"

const TOP_EDGE_BAND = 12
const STANDALONE_WEB_APP =
  Platform.OS === "web" && window.matchMedia("(display-mode: standalone)").matches

/** why: iOS 26 blurs the top of a home screen web app unless a fixed, solid band over 10px tall covers the top edge. index.html paints that band in portrait, so top content starts below it. */
export function useTopEdgeBand() {
  const { width, height } = useWindowDimensions()
  return STANDALONE_WEB_APP && height > width ? TOP_EDGE_BAND : 0
}
