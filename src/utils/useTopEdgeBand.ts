import { useSyncExternalStore } from "react"
import { Platform } from "react-native"

const TOP_EDGE_BAND = 12
const IOS_HOME_SCREEN_APP =
  Platform.OS === "web" && "standalone" in navigator && navigator.standalone === true
const portrait = IOS_HOME_SCREEN_APP ? window.matchMedia("(orientation: portrait)") : null

function subscribe(onChange: () => void) {
  portrait?.addEventListener("change", onChange)
  return () => portrait?.removeEventListener("change", onChange)
}

/** why: iOS 26 blurs the top of a home screen web app unless a fixed, solid band over 10px tall covers the top edge. index.html paints that band with the same conditions, so top content starts below it. */
export function useTopEdgeBand() {
  const inPortrait = useSyncExternalStore(
    subscribe,
    () => portrait?.matches ?? false,
    () => false,
  )
  return inPortrait ? TOP_EDGE_BAND : 0
}
