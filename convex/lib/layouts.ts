import { v } from "convex/values"

export const PLAYER_GRID_LAYOUT_VARIANTS = [
  "auto",
  "featured-first",
  "featured-last",
  "even-grid",
  "tabletop",
] as const

export type PlayerGridLayoutVariant = (typeof PLAYER_GRID_LAYOUT_VARIANTS)[number]

export const playerGridLayoutValidator = v.union(
  ...PLAYER_GRID_LAYOUT_VARIANTS.map((variant) => v.literal(variant)),
)

export const isPlayerGridLayoutVariant = (value: unknown): value is PlayerGridLayoutVariant =>
  PLAYER_GRID_LAYOUT_VARIANTS.some((variant) => variant === value)
