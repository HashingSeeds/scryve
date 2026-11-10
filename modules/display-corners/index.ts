import { Platform } from "react-native"
import { requireOptionalNativeModule } from "expo"

import { iosDisplayCornerRadii, type CornerRadii } from "./src/iosDisplayCorners"

export type { CornerRadii } from "./src/iosDisplayCorners"

declare class DisplayCornersModule {
  windowCornerRadii?(): (number | null)[] | null
  modelIdentifier?: string
  pointScale?: number
}

/** why: binaries built before this module existed have no native side, so they keep square corners. */
const native = requireOptionalNativeModule<DisplayCornersModule>("DisplayCorners")

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
