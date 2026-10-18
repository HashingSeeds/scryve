import type { Translations } from "@/i18n/en"
import { translate } from "@/i18n/translate"

export const PLAYER_GRID_LAYOUT_VARIANTS = [
  "auto",
  "featured-first",
  "featured-last",
  "even-grid",
  "tabletop",
] as const

export type PlayerGridLayoutVariant = (typeof PLAYER_GRID_LAYOUT_VARIANTS)[number]

type PlayerGridLayoutLabel = keyof Translations["board"]["layout"]

export interface PlayerGridLayoutOption {
  variant: PlayerGridLayoutVariant
  label: string
}

function layoutLabels(playerCount: number): [PlayerGridLayoutVariant, PlayerGridLayoutLabel][] {
  if (playerCount === 3)
    return [
      ["auto", "topFocus"],
      ["featured-last", "bottomFocus"],
      ["even-grid", "evenGrid"],
    ]
  if (playerCount === 4 || playerCount === 6)
    return [
      ["auto", "balanced"],
      ["tabletop", "table"],
    ]
  if (playerCount === 5)
    return [
      ["auto", "bottomFocus"],
      ["featured-first", "topFocus"],
      ["even-grid", "evenGrid"],
    ]
  return [["auto", "balanced"]]
}

export function getPlayerGridLayoutOptions(playerCount: number): PlayerGridLayoutOption[] {
  return layoutLabels(playerCount).map(([variant, label]) => ({
    variant,
    label: translate(`board:layout.${label}`),
  }))
}

export function playerGridLayoutAccessibilityLabel(
  playerCount: number,
  variant: PlayerGridLayoutVariant,
) {
  const label = layoutLabels(playerCount).find(([candidate]) => candidate === variant)?.[1]
  return label && translate(`board:layoutOption.${label}`)
}

export function playerGridLayoutForCount(
  playerCount: number,
  value: unknown,
): PlayerGridLayoutVariant {
  return getPlayerGridLayoutOptions(playerCount).some(({ variant }) => variant === value)
    ? (value as PlayerGridLayoutVariant)
    : "auto"
}

export type SeatOrder = readonly number[]

export function isSeatOrder(value: unknown, playerCount: number): value is SeatOrder {
  return (
    Array.isArray(value) &&
    value.length === playerCount &&
    Array.from({ length: playerCount }, (_, index) => index).every((index) => value.includes(index))
  )
}

export function swapSeats(
  order: SeatOrder | undefined,
  playerCount: number,
  first: number,
  second: number,
): number[] {
  const next = order ? [...order] : Array.from({ length: playerCount }, (_, index) => index)
  ;[next[first], next[second]] = [next[second], next[first]]
  return next
}
