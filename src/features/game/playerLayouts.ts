export const PLAYER_GRID_LAYOUT_VARIANTS = [
  "auto",
  "featured-first",
  "featured-last",
  "even-grid",
  "tabletop",
] as const

export type PlayerGridLayoutVariant = (typeof PLAYER_GRID_LAYOUT_VARIANTS)[number]

export interface PlayerGridLayoutOption {
  variant: PlayerGridLayoutVariant
  label: string
}

export function isPlayerGridLayoutVariant(value: unknown): value is PlayerGridLayoutVariant {
  return PLAYER_GRID_LAYOUT_VARIANTS.some((variant) => variant === value)
}

export function getPlayerGridLayoutOptions(playerCount: number): PlayerGridLayoutOption[] {
  if (playerCount === 2) return [{ variant: "auto", label: "Balanced" }]
  if (playerCount === 3)
    return [
      { variant: "auto", label: "Top focus" },
      { variant: "featured-last", label: "Bottom focus" },
      { variant: "even-grid", label: "Even grid" },
    ]
  if (playerCount === 4 || playerCount === 6)
    return [
      { variant: "auto", label: "Balanced" },
      { variant: "tabletop", label: "Table" },
    ]
  if (playerCount === 5)
    return [
      { variant: "auto", label: "Bottom focus" },
      { variant: "featured-first", label: "Top focus" },
      { variant: "even-grid", label: "Even grid" },
    ]
  return [{ variant: "auto", label: "Balanced" }]
}

export function playerGridLayoutForCount(
  playerCount: number,
  value: unknown,
): PlayerGridLayoutVariant {
  return getPlayerGridLayoutOptions(playerCount).some(({ variant }) => variant === value)
    ? (value as PlayerGridLayoutVariant)
    : "auto"
}
