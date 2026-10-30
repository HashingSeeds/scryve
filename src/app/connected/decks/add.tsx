import { router } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { AddDeckScreen } from "@/screens/AddDeckScreen"
import { captureAnalytics } from "@/utils/analytics"
import { goBack } from "@/utils/navigation"

const leaveAdd = () => goBack("/connected/decks")

export default function AddDeckRoute() {
  return (
    <CloudScreen onBack={leaveAdd}>
      {(access) => (
        <AddDeckScreen
          access={access}
          onBack={leaveAdd}
          onCreated={(deckId) => {
            captureAnalytics("deck_used", { feature: "saved" })
            router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
          }}
        />
      )}
    </CloudScreen>
  )
}
