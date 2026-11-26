import type { FocusedCardDetails } from "@/components/CardFocusDialog"

import { facetKeywords } from "../../../convex/lib/games/cards"

export function catalogCardDetails(card: {
  imageUrl?: string
  smallImageUrl?: string
  typeLabel?: string
  text?: string
  setCode?: string
  collectorNumber?: string
  rarity?: string
  facets?: readonly { key: string; value: string }[]
}): FocusedCardDetails {
  return {
    imageUrl: card.imageUrl,
    smallImageUrl: card.smallImageUrl,
    typeLine: card.typeLabel,
    oracleText: card.text,
    setName: card.setCode,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
    facets: card.facets && JSON.stringify(card.facets),
    keywords: facetKeywords(card.facets),
  }
}
