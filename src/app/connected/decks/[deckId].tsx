import { Redirect, router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { DeckDetailScreen } from "@/screens/DeckDetailScreen"

export default function DeckDetailRoute() {
  const { deckId } = useLocalSearchParams<{ deckId?: string }>()
  if (!deckId) return <Redirect href="/connected/decks" />
  return (
    <ConnectedGate onBack={() => router.back()}>
      <DeckDetailScreen deckId={deckId} onBack={() => router.back()} />
    </ConnectedGate>
  )
}
