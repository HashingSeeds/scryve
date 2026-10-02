import { useEffect } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { guestDeckLocalId } from "@/features/decks/guestDeck"
import { recordRecentDeck } from "@/features/decks/recentDecks"
import { DeckDetailScreen, type DeckDetailSummary } from "@/screens/DeckDetailScreen"
import { GuestDeckDetailScreen } from "@/screens/GuestDeckDetailScreen"

export default function DeckDetailRoute() {
  const { deckId, deckName, deckGame, deckFormat, deckCardQuantity, reviewChanges } =
    useLocalSearchParams<{
      reviewChanges?: string
      deckId?: string
      deckName?: string
      deckGame?: string
      deckFormat?: string
      deckCardQuantity?: string
    }>()
  const legacyGuestRoute = deckId === "guest"
  useEffect(() => {
    if (deckId && !legacyGuestRoute) recordRecentDeck(deckId)
  }, [deckId, legacyGuestRoute])
  if (!deckId || legacyGuestRoute) return <Redirect href="/connected/decks" />
  const guestLocalId = guestDeckLocalId(deckId)
  if (guestLocalId)
    return <GuestDeckDetailScreen localId={guestLocalId} onBack={() => router.back()} />
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
          reviewChanges={reviewChanges === "true"}
          onBack={() => router.back()}
        />
      )}
    </CloudScreen>
  )
}
