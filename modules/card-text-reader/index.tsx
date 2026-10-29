import type { ViewProps } from "react-native"
import { requireNativeView, requireOptionalNativeModule } from "expo"

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
  detection?: { tracked: boolean; rectangles: CardRectangle[] }
}

type CardTextCameraProps = ViewProps & {
  active: boolean
  guide?: Point & { width: number; height: number }
  onText: (event: { nativeEvent: CardPhotoText }) => void
}

/** why: null on web, Jest, and binaries built before the module existed. */
export const canReadCardText = requireOptionalNativeModule("CardTextReader") !== null

const NativeCardTextCamera = canReadCardText
  ? requireNativeView<CardTextCameraProps>("CardTextReader")
  : undefined

export function CardTextCamera(props: CardTextCameraProps) {
  return NativeCardTextCamera ? <NativeCardTextCamera {...props} /> : null
}
