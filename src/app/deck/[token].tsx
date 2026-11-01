import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { isShareToken } from "@/features/decks/shareLinks"
import { SharedDeckScreen } from "@/screens/SharedDeckScreen"
import { goBack } from "@/utils/navigation"

const leaveSharedDeck = () => goBack("/connected/decks")

export default function SharedDeckRoute() {
  const { token } = useLocalSearchParams<{ token?: string }>()
  if (!token || !isShareToken(token)) return <Redirect href="/" />
  return (
    <CloudScreen onBack={leaveSharedDeck}>
      {(access) => (
        <SharedDeckScreen
          token={token}
          access={access}
          onBack={leaveSharedDeck}
          onPlay={(deckKey) => router.push({ pathname: "/game/new", params: { deckId: deckKey } })}
          onSaved={(deckId) =>
            router.replace({ pathname: "/connected/decks/[deckId]", params: { deckId } })
          }
        />
      )}
    </CloudScreen>
  )
}
