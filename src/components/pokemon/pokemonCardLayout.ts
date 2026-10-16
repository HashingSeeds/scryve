import type { HostInstance, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform } from "react-native"

import { translate } from "@/i18n/translate"

import type { PokemonInPlay } from "../../../convex/lib/table"
import {
  getLifeFontSizeThatFits,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardEdge,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "../playerCardTypes"

export const CONTENT_EDGES: Record<LifeCardContentRotation, Record<LifeCardEdge, LifeCardEdge>> = {
  0: { top: "top", right: "right", bottom: "bottom", left: "left" },
  90: { top: "right", right: "bottom", bottom: "left", left: "top" },
  [-90]: { top: "left", right: "top", bottom: "right", left: "bottom" },
  180: { top: "bottom", right: "left", bottom: "top", left: "right" },
}

export function contentInsetsFor(
  rotation: LifeCardContentRotation,
  insets: LifeCardContentInsets | undefined,
): LifeCardContentInsets {
  const edges = CONTENT_EDGES[rotation]
  return {
    top: insets?.[edges.top] ?? 0,
    right: insets?.[edges.right] ?? 0,
    bottom: insets?.[edges.bottom] ?? 0,
    left: insets?.[edges.left] ?? 0,
  }
}

// why: measured from the seat edge, this clears the larger 80pt menu pentagon at its widest point with an 8pt gap.
export const MENU_CLEARANCE = 44

export type BenchClearance = { top: number; left: number; right: number }
const NO_CLEARANCE: BenchClearance = { top: 0, left: 0, right: 0 }

export function benchMenuClearance(
  rotation: LifeCardContentRotation,
  menuCorner: LifeCardMenuCorner | undefined,
  menuEdgeCenter: LifeCardMenuEdge | undefined,
): BenchClearance {
  const edges = CONTENT_EDGES[rotation]
  if (menuEdgeCenter === edges.top) return { ...NO_CLEARANCE, top: MENU_CLEARANCE }
  const corner = menuCorner?.toLowerCase()
  if (!corner || !corner.includes(edges.top)) return NO_CLEARANCE
  return corner.includes(edges.left)
    ? { ...NO_CLEARANCE, left: MENU_CLEARANCE }
    : { ...NO_CLEARANCE, right: MENU_CLEARANCE }
}

export function moveFocus(target: HostInstance | null | undefined) {
  if (!target) return
  if (Platform.OS === "web") target.focus()
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus")
}

export function rotatedLayerStyle(
  rotation: LifeCardContentRotation,
  cardWidth: number,
  cardHeight: number,
): ViewStyle {
  const sideways = Math.abs(rotation) === 90
  const bounds: ViewStyle =
    sideways && cardWidth > 0 && cardHeight > 0
      ? {
          width: cardHeight,
          height: cardWidth,
          left: (cardWidth - cardHeight) / 2,
          top: (cardHeight - cardWidth) / 2,
          right: undefined,
          bottom: undefined,
        }
      : {}
  return { ...bounds, transform: [{ rotate: `${rotation}deg` }] }
}

export const HERO_FONT_MAX = 96
const HERO_FONT_FALLBACK = 80
const HERO_FONT_MIN = 30
const HERO_GUTTER = 56

export function heroFontSize(input: {
  width: number
  height: number
  digits: number
  fontScale: number
}): number {
  if (!(input.width > 0)) return HERO_FONT_FALLBACK
  return Math.max(
    HERO_FONT_MIN,
    Math.min(
      HERO_FONT_MAX,
      getLifeFontSizeThatFits({
        availableWidth: input.width - HERO_GUTTER * 2,
        availableHeight: Math.max(input.height, 1),
        digits: Math.max(input.digits, 2),
        fontScale: input.fontScale,
      }),
    ),
  )
}

export const CHIP_BAR_HEIGHT = 3
const BENCH_MAX_FONT_SCALE = 1.3
const BENCH_CHIP = {
  regular: { height: 56, nameSize: 12, nameLine: 18, hpSize: 22, hpLine: 24 },
  compact: { height: 44, nameSize: 12, nameLine: 14, hpSize: 17, hpLine: 19 },
}

// why: Android caps a font's size at maxFontSizeMultiplier but not its explicit lineHeight, so chip text opts out of system scaling and takes these sizes, scaled once here, on both platforms.
export function benchChipMetrics(compact: boolean, fontScale: number) {
  const chip = compact ? BENCH_CHIP.compact : BENCH_CHIP.regular
  const scale = Math.min(fontScale, BENCH_MAX_FONT_SCALE)
  return {
    height: chip.height + (chip.nameLine + chip.hpLine) * (scale - 1),
    nameSize: chip.nameSize * scale,
    nameLine: chip.nameLine * scale,
    hpSize: chip.hpSize * scale,
    hpLine: chip.hpLine * scale,
  }
}
export type BenchChipMetrics = ReturnType<typeof benchChipMetrics>

export function pokemonName(pokemon: Pick<PokemonInPlay, "name">): string {
  return pokemon.name?.trim() || translate("board:pokemon.unnamed")
}

export function knockoutMessage(input: {
  pokemon: Pick<PokemonInPlay, "name">
  takerName?: string
  prizesTaken: number
}): string {
  const name = pokemonName(input.pokemon)
  if (!input.takerName || input.prizesTaken === 0)
    return translate("board:pokemon.knockedOut", { name })
  return translate("board:pokemon.knockedOutTakes", {
    name,
    taker: input.takerName,
    count: input.prizesTaken,
  })
}

export function parseHp(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return undefined
  const hp = Number(trimmed)
  return hp > 0 ? hp : undefined
}
