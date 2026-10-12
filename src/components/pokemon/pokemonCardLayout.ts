import type { HostInstance, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform } from "react-native"

import type { PokemonInPlay } from "../../../convex/lib/table"
import {
  getLifeFontSizeThatFits,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardEdge,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "../playerCardTypes"

/** why: the whole seat lays out in content space (bench along the top, prizes bottom-left) and turns as one layer, so screen-space insets are mapped onto content edges here. */
const CONTENT_EDGES: Record<LifeCardContentRotation, Record<LifeCardEdge, LifeCardEdge>> = {
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

export const MENU_CLEARANCE = 44

export type BenchClearance = { top: number; left: number; right: number }
const NO_CLEARANCE: BenchClearance = { top: 0, left: 0, right: 0 }

/** why: the bench sits on the inner edge, where the game menu button also lives. A menu centered on that edge pushes the bench down; a menu at a corner only shortens the bench on that side, which keeps the height a cramped seat needs. */
export function benchMenuClearance(
  rotation: LifeCardContentRotation,
  menuCorner: LifeCardMenuCorner | undefined,
  menuEdgeCenter: LifeCardMenuEdge | undefined,
): BenchClearance {
  const edges = CONTENT_EDGES[rotation]
  if (menuEdgeCenter === edges.top) return { ...NO_CLEARANCE, top: MENU_CLEARANCE }
  // why: corner names carry both axes ("topRight"), and a sideways seat's inner edge is left or right.
  const corner = menuCorner?.toLowerCase()
  if (!corner || !corner.includes(edges.top)) return NO_CLEARANCE
  return corner.includes(edges.left)
    ? { ...NO_CLEARANCE, left: MENU_CLEARANCE }
    : { ...NO_CLEARANCE, right: MENU_CLEARANCE }
}

/** why: a sheet replaces the controls that opened it, so focus moves by hand: into the sheet when it opens and back to its trigger when it closes. Web moves keyboard focus; native moves the screen reader. */
export function moveFocus(target: HostInstance | null | undefined) {
  if (!target) return
  if (Platform.OS === "web") target.focus()
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus")
}

/** why: a sideways seat lays out in a frame with its sides swapped, then turns into place, like the life editor. */
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
// why: the tap halves show "+30" style feedback beside the number, so the number leaves room for it on each side.
const HERO_GUTTER = 56

export function heroFontSize(input: {
  width: number
  height: number
  digits: number
  fontScale: number
}): number {
  if (!(input.width > 0)) return HERO_FONT_FALLBACK
  // why: a cramped seat still gets a legible number; the caption gives way before the HP does.
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

export function pokemonName(pokemon: Pick<PokemonInPlay, "name">): string {
  return pokemon.name?.trim() || "Pokémon"
}

export function prizeWord(count: number): string {
  return `${count} ${Math.abs(count) === 1 ? "prize" : "prizes"}`
}

export function knockoutMessage(input: {
  pokemon: Pick<PokemonInPlay, "name">
  takerName?: string
  prizesTaken: number
}): string {
  const head = `${pokemonName(input.pokemon)} knocked out.`
  if (!input.takerName || input.prizesTaken === 0) return head
  return `${head} ${input.takerName} takes ${prizeWord(input.prizesTaken)}.`
}

export function parseHp(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return undefined
  const hp = Number(trimmed)
  return hp > 0 ? hp : undefined
}
