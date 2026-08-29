import type { FocusedCardDetails } from "@/components/CardFocusDialog"

export function catalogCardDetails(card: {
  typeLabel?: string
  text?: string
  setCode?: string
  collectorNumber?: string
  rarity?: string
}): FocusedCardDetails {
  return {
    typeLine: card.typeLabel,
    oracleText: card.text,
    setName: card.setCode,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
  }
}
