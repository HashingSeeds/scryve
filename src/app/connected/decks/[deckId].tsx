import { useEffect } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { recordRecentDeck } from "@/features/decks/recentDecks"
import { DeckDetailScreen, type DeckDetailSummary } from "@/screens/DeckDetailScreen"

export default function DeckDetailRoute() {
  const { deckId, deckName, deckGame, deckFormat, deckCardQuantity } = useLocalSearchParams<{
    deckId?: string
    deckName?: string
    deckGame?: string
    deckFormat?: string
    deckCardQuantity?: string
  }>()
  useEffect(() => {
    if (deckId) recordRecentDeck(deckId)
  }, [deckId])
  if (!deckId) return <Redirect href="/connected/decks" />
  const cardQuantity = deckCardQuantity === undefined ? undefined : Number(deckCardQuantity)
  const summary: DeckDetailSummary | undefined =
    deckName && deckGame && deckFormat
      ? {
          name: deckName,
          game: deckGame,
          format: deckFormat,
          ...(Number.isFinite(cardQuantity) ? { cardQuantity } : {}),
        }
      : undefined
  return (
    <ConnectedGate onBack={() => router.back()}>
      <DeckDetailScreen deckId={deckId} summary={summary} onBack={() => router.back()} />
    </ConnectedGate>
  )
}
