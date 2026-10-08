import { router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { RecordMatchScreen } from "@/screens/RecordMatchScreen"

import type { Id } from "../../../../convex/_generated/dataModel"

export default function RecordMatchRoute() {
  const { deckId, versionId, deckName } = useLocalSearchParams<{
    deckId?: string
    versionId?: string
    deckName?: string
  }>()
  // why: after a web refresh there is no history, so fall back to where the form was opened from.
  const leave = () =>
    router.canGoBack()
      ? router.back()
      : deckId
        ? router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
        : router.replace("/history")
  return (
    <CloudScreen onBack={leave}>
      {(access) => (
        <RecordMatchScreen
          access={access}
          deck={
            deckId && versionId
              ? { versionId: versionId as Id<"deckVersions">, name: deckName ?? "Deck" }
              : undefined
          }
          onBack={leave}
          onSaved={leave}
        />
      )}
    </CloudScreen>
  )
}
