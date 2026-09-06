import { useEffect } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { recordRecentDeck } from "@/features/decks/recentDecks"
import { DeckDetailScreen, type DeckDetailSummary } from "@/screens/DeckDetailScreen"
import { GuestDeckDetailScreen } from "@/screens/GuestDeckDetailScreen"

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
  if (deckId === "guest") return <GuestDeckDetailScreen onBack={() => router.back()} />
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
    <CloudScreen onBack={() => router.back()}>
      {(access) => (
        <DeckDetailScreen
          access={access}
          deckId={deckId}
          summary={summary}
          onBack={() => router.back()}
        />
      )}
    </CloudScreen>
  )
}
