import type { NormalizedCard } from "./cards"

export type SectionCard = Partial<Pick<NormalizedCard, "category" | "facets">>

const YGO_EXTRA_FRAMES = new Set([
  "fusion",
  "fusion_pendulum",
  "synchro",
  "synchro_pendulum",
  "xyz",
  "xyz_pendulum",
  "link",
])

const RIFTBOUND_SECTION_BY_TYPE: Partial<Record<string, string>> = {
  Legend: "legend",
  Battlefield: "battlefields",
  Rune: "runes",
}

const SECTION_BY_GAME: Partial<Record<string, (card: SectionCard) => string>> = {
  ygo: (card) =>
    YGO_EXTRA_FRAMES.has(card.facets?.find((item) => item.key === "frameType")?.value ?? "")
      ? "extra"
      : "main",
  riftbound: (card) => RIFTBOUND_SECTION_BY_TYPE[card.category ?? ""] ?? "main",
}

/** why: an imported line under no heading and a card added from search both land in the section its type belongs to. */
export function cardTypeSection(game: string, card: SectionCard) {
  return SECTION_BY_GAME[game]?.(card)
}
