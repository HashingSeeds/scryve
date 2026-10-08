import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { RecordMatchScreen } from "@/screens/RecordMatchScreen"

import type { Id } from "../../../../convex/_generated/dataModel"

export default function RecordMatchRoute() {
  const { versionId, deckName } = useLocalSearchParams<{ versionId?: string; deckName?: string }>()
  if (!versionId) return <Redirect href="/connected/decks" />
  return (
    <CloudScreen onBack={() => router.back()}>
      {(access) => (
        <RecordMatchScreen
          access={access}
          deck={{ versionId: versionId as Id<"deckVersions">, name: deckName ?? "Deck" }}
          onBack={() => router.back()}
          onSaved={() => router.back()}
        />
      )}
    </CloudScreen>
  )
}
