import { router } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { AddDeckScreen } from "@/screens/AddDeckScreen"
import { captureAnalytics } from "@/utils/analytics"

export default function AddDeckRoute() {
  return (
    <CloudScreen onBack={() => router.back()}>
      {(access) => (
        <AddDeckScreen
          access={access}
          onBack={() => router.back()}
          onCreated={(deckId) => {
            captureAnalytics("deck_used", { feature: "saved" })
            router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
          }}
        />
      )}
    </CloudScreen>
  )
}
