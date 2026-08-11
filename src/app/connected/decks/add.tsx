import { router } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { AddDeckScreen } from "@/screens/AddDeckScreen"

export default function AddDeckRoute() {
  return (
    <ConnectedGate onBack={() => router.back()}>
      <AddDeckScreen
        onBack={() => router.back()}
        onCreated={(deckId) =>
          router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
        }
      />
    </ConnectedGate>
  )
}
