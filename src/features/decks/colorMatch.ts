import { COMMANDER_COLORS } from "@/components/CardFocusDialog"

export const SEARCH_COLORS = [...COMMANDER_COLORS, "C"] as const
export const COLOR_MATCHES = [
  { id: "within", tx: "decks:cardSearch.withinColors" },
  { id: "additional", tx: "decks:cardSearch.allowAdditional" },
  { id: "exact", tx: "decks:cardSearch.exactColors" },
] as const
export type ColorMatch = (typeof COLOR_MATCHES)[number]["id"]

export function isColorMatch(value: unknown): value is ColorMatch {
  return COLOR_MATCHES.some(({ id }) => id === value)
}

/** why: colorless can't combine with a color, so picking it clears the others and the reverse. */
export function toggleColor(current: readonly string[], color: string) {
  if (color === "C") return current.includes("C") ? [] : ["C"]
  return current.includes(color)
    ? current.filter((value) => value !== color)
    : [...current.filter((value) => value !== "C"), color]
}

/** why: an unknown identity (undefined) never matches, and a commander that names its own color may miss one picked color. */
export function matchesColors(
  identity: string | undefined,
  picked: readonly string[],
  match: ColorMatch,
  choosesColor = false,
) {
  if (!picked.length) return true
  if (picked.includes("C")) return identity === "" && !choosesColor
  if (identity === undefined) return false
  const within = [...identity].every((color) => picked.includes(color))
  if (match === "within") return within
  const missing = picked.filter((color) => !identity.includes(color))
  return (
    (missing.length === 0 || (choosesColor && missing.length === 1)) &&
    (match === "additional" || within)
  )
}
