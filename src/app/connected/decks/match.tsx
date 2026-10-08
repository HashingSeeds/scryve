import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { RecordMatchScreen } from "@/screens/RecordMatchScreen"

import type { Id } from "../../../../convex/_generated/dataModel"

export default function RecordMatchRoute() {
  const { deckId, versionId, deckName } = useLocalSearchParams<{
    deckId?: string
    versionId?: string
    deckName?: string
  }>()
  if (!deckId || !versionId) return <Redirect href="/connected/decks" />
  // why: after a web refresh there is no history, so fall back to the deck instead of hanging.
  const leave = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
  return (
    <CloudScreen onBack={leave}>
      {(access) => (
        <RecordMatchScreen
          access={access}
          deck={{ versionId: versionId as Id<"deckVersions">, name: deckName ?? "Deck" }}
          onBack={leave}
          onSaved={leave}
        />
      )}
    </CloudScreen>
  )
}
