import { Platform } from "react-native"
import { requireOptionalNativeModule } from "expo"

import { iosDisplayCornerRadii, type CornerRadii } from "./src/iosDisplayCorners"

export type { CornerRadii } from "./src/iosDisplayCorners"

declare class DisplayCornersModule {
  windowCornerRadii?(): (number | null)[] | null
  modelIdentifier?: string
  pointScale?: number
}

/** why: null on web, Jest, and binaries built before the module existed, which keep square corners. */
const native = requireOptionalNativeModule<DisplayCornersModule>("DisplayCorners")

/** why: Android measures the window's corners as it stands now, while iOS knows only the upright hardware's, so `frame` says which the radii (top left, clockwise) are in. */
export type DisplayCorners = { radii: CornerRadii; frame: "window" | "upright" }

export function displayCorners(): DisplayCorners | null {
  if (!native) return null
  if (Platform.OS === "android") {
    const radii = native.windowCornerRadii?.()
    return radii?.length === 4
      ? { radii: [radii[0], radii[1], radii[2], radii[3]], frame: "window" }
      : null
  }
  if (Platform.OS !== "ios" || !native.modelIdentifier) return null
  const radii = iosDisplayCornerRadii(native.modelIdentifier, native.pointScale ?? 1)
  return radii ? { radii, frame: "upright" } : null
}
