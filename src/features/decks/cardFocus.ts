import type { FocusedCardDetails } from "@/components/CardFocusDialog"

export function catalogCardDetails(card: {
  imageUrl?: string
  smallImageUrl?: string
  typeLabel?: string
  text?: string
  setCode?: string
  collectorNumber?: string
  rarity?: string
}): FocusedCardDetails {
  return {
    imageUrl: card.imageUrl,
    smallImageUrl: card.smallImageUrl,
    typeLine: card.typeLabel,
    oracleText: card.text,
    setName: card.setCode,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
  }
}
