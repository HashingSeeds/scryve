export type LifeCardContentRotation = -90 | 0 | 90 | 180

export const LIFE_TARGET_SIZE = 116
export const COMPACT_LIFE_TARGET_SIZE = 84
export const LIFE_TARGET_TEXT_INSET = 8
export const LIFE_MAX_FONT_SCALE = 1.3

export const LIFE_DIGIT_ASPECT = 0.62
export const LIFE_LINE_HEIGHT_RATIO = 1.1
export const LIFE_FONT_MIN = 12
export const LIFE_FONT_MAX = 80
export const LIFE_FONT_SIZE = 60
export const COMPACT_LIFE_FONT_SIZE = 42

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
