import { requireOptionalNativeModule } from "expo"

export type CardTextLine = {
  text: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  confidence: number
}

export type CardPhotoText = { width: number; height: number; lines: CardTextLine[] }

/** why: null on web, Jest, and binaries built before the module existed. */
const native = requireOptionalNativeModule<{ read(uri: string): Promise<CardPhotoText> }>(
  "CardTextReader",
)

export const canReadCardText = native !== null

export function readCardText(uri: string): Promise<CardPhotoText> {
  return native?.read(uri) ?? Promise.reject(new Error("CardTextReader is unavailable"))
}
