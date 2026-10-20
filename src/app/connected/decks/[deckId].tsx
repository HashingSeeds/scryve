import { useEffect } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { CloudScreen } from "@/features/auth/CloudScreen"
import { guestDeckLocalId, guestDeckRouteId } from "@/features/decks/guestDeck"
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
  if (guestLocalId) return <LocalDeckDetailRoute localId={guestLocalId} />
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
          onUnsynced={(localId) =>
            router.replace({
              pathname: "/connected/decks/[deckId]",
              params: { deckId: guestDeckRouteId(localId) },
            })
          }
          onAddMatch={(versionId, name) =>
            router.push({
              pathname: "/connected/decks/match",
              params: { deckId, versionId, deckName: name },
            })
          }
        />
      )}
    </CloudScreen>
  )
}

// why: CloudScreen blocks builds without sign-in, and a local deck must stay usable there.
function LocalDeckDetailRoute({ localId }: { localId: string }) {
  const auth = useAuthAccess()
  if (!auth.configured)
    return <GuestDeckDetailScreen localId={localId} onBack={() => router.back()} />
  return (
    <CloudScreen onBack={() => router.back()}>
      {(access) => (
        <GuestDeckDetailScreen
          localId={localId}
          access={access}
          onBack={() => router.back()}
          onSynced={(deckId) =>
            router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
          }
        />
      )}
    </CloudScreen>
  )
}
