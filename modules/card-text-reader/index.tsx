import type { ViewProps } from "react-native"
import { requireNativeView, requireOptionalNativeModule } from "expo"
import * as Haptics from "expo-haptics"

export type CardTextLine = {
  text: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  confidence: number
}

type Point = { x: number; y: number }

export type CardRectangle = {
  aspect: number
  share: number
  rejected?: "shape" | "position" | "size"
}

export type CardPhotoText = {
  width: number
  height: number
  lines: CardTextLine[]
  cardCorners?: Point[]
  detection?: { rectangles: CardRectangle[]; thermal?: "nominal" | "fair" | "serious" | "critical" }
}

type CardTextCameraProps = ViewProps & {
  active: boolean
  guide?: Point & { width: number; height: number }
  onText: (event: { nativeEvent: CardPhotoText }) => void
}

type CardTextReaderModule = {
  haptic?: (kind: ScanHaptic) => Promise<void>
  prepareHaptics?: () => Promise<void>
}
type ScanHaptic = "added" | "skipped"

const nativeModule = requireOptionalNativeModule<CardTextReaderModule>("CardTextReader")

/** why: null on web, Jest, and binaries built before the module existed. */
export const canReadCardText = nativeModule !== null

/** why: binaries without the native haptic fall back to expo-haptics. */
export function scanHaptic(kind: ScanHaptic) {
  const played = nativeModule?.haptic
    ? nativeModule.haptic(kind)
    : kind === "skipped"
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  void played.catch(() => undefined)
}

/** why: called when a card is about to be accepted, so its haptic plays without warm-up lag. */
export function prepareScanHaptics() {
  void nativeModule?.prepareHaptics?.().catch(() => undefined)
}

const NativeCardTextCamera = canReadCardText
  ? requireNativeView<CardTextCameraProps>("CardTextReader")
  : undefined

export function CardTextCamera(props: CardTextCameraProps) {
  return NativeCardTextCamera ? <NativeCardTextCamera {...props} /> : null
}
