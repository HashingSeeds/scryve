import { Platform } from "react-native"

export type LifeCardContentRotation = -90 | 0 | 90 | 180
export type LifeCardMenuCorner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
export type LifeCardMenuEdge = "top" | "bottom" | "left" | "right"

export interface LifeCardContentInsets {
  top: number
  bottom: number
  left: number
  right: number
}

export type LifeCardEdge = keyof LifeCardContentInsets
export type LifeCardScreenEdges = Record<LifeCardEdge, boolean>

export function lifeCardContentInsetStyle(insets?: LifeCardContentInsets): {
  paddingTop: number
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
} {
  return {
    paddingTop: insets?.top ?? 0,
    paddingBottom: insets?.bottom ?? 0,
    paddingLeft: insets?.left ?? 0,
    paddingRight: insets?.right ?? 0,
  }
}

export const LIFE_TARGET_SIZE = 200
export const COMPACT_LIFE_TARGET_SIZE = 140
export const LIFE_TARGET_TEXT_INSET = 8
export const LIFE_MAX_FONT_SCALE = 1.3

export const LIFE_DIGIT_ASPECT = 0.62
export const LIFE_LINE_HEIGHT_RATIO = 1.1
export const LIFE_FONT_MIN = 12
export const LIFE_FONT_MAX = 160
export const LIFE_FONT_SIZE = 120
export const COMPACT_LIFE_FONT_SIZE = 84

export const SCREEN_CORNER_CLEARANCE = 24
export const TUCKS_INTO_SCREEN_CORNERS = Platform.OS !== "web"
// why: an iOS bottom inset is the thin home indicator bar, so corners beside it only clear the rounded display; an Android one can be a full-width button bar.
export const BOTTOM_INSET_IS_HOME_INDICATOR = Platform.OS === "ios"
// why: insets give a cutout's depth but not its width; a tucked name stops short of a Dynamic Island or home indicator sized cutout.
export const CUTOUT_HALF_WIDTH = 64

export function cornerOffset(
  gap: number,
  edge: LifeCardEdge,
  side: LifeCardEdge,
  insets?: LifeCardContentInsets,
  screenEdges?: LifeCardScreenEdges,
) {
  const inset = insets?.[edge] ?? 0
  const screenCorner = !!screenEdges?.[edge] && !!screenEdges[side]
  return screenCorner ? Math.min(gap + inset, Math.max(gap, SCREEN_CORNER_CLEARANCE)) : gap + inset
}

export const LIFE_GLYPH_LINE_HEIGHT = 50
export const COMPACT_LIFE_GLYPH_LINE_HEIGHT = 34

export function getLifeLineHeight(fontSize: number) {
  return Math.ceil(fontSize * LIFE_LINE_HEIGHT_RATIO)
}

export function getLifeFontSizeThatFits(input: {
  availableWidth: number
  availableHeight: number
  digits: number
  fontScale: number
}): number {
  const scale = Math.min(Math.max(input.fontScale, 0.1), LIFE_MAX_FONT_SCALE)
  const byWidth = input.availableWidth / (Math.max(input.digits, 2) * LIFE_DIGIT_ASPECT * scale)
  const byHeight = input.availableHeight / (LIFE_LINE_HEIGHT_RATIO * scale)
  return Math.max(LIFE_FONT_MIN, Math.min(LIFE_FONT_MAX, Math.floor(Math.min(byWidth, byHeight))))
}

export function getLifeTargetTextSpace(targetSize: number) {
  return Math.max(targetSize - LIFE_TARGET_TEXT_INSET * 2, 1)
}
