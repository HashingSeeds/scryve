import { router, Stack } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { AddDeckProvider } from "@/screens/AddDeckScreen"
import { captureAnalytics } from "@/utils/analytics"
import { goBack } from "@/utils/navigation"

const leaveAdd = () => goBack("/connected/decks")

export default function AddDeckLayout() {
  return (
    <CloudScreen onBack={leaveAdd}>
      {(access) => (
        <AddDeckProvider
          access={access}
          onBack={leaveAdd}
          onCreated={(deckId) => {
            captureAnalytics("deck_used", { feature: "saved" })
            router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
          }}
          onPreview={() => router.push("/connected/decks/add/preview")}
          onClosePreview={() => router.back()}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </AddDeckProvider>
      )}
    </CloudScreen>
  )
}
