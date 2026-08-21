import { router } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { DecksScreen } from "@/screens/DecksScreen"

export default function DecksRoute() {
  return (
    <ConnectedGate onBack={() => router.back()}>
      <DecksScreen
        onBack={() => router.back()}
        onAddDeck={() => router.push("/connected/decks/add")}
        onSelect={(deck) =>
          router.push({
            pathname: "/connected/decks/[deckId]",
            params: {
              deckId: deck.deckId,
              deckName: deck.name,
              deckGame: deck.game,
              deckFormat: deck.format,
              ...(deck.cardQuantity !== undefined
                ? { deckCardQuantity: String(deck.cardQuantity) }
                : {}),
            },
          })
        }
      />
    </ConnectedGate>
  )
}
