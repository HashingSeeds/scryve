import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { localGameRepository } from "@/features/game/localPersistence"
import { DecksScreen } from "@/screens/DecksScreen"

export default function DecksRoute() {
  const auth = useAuthAccess()
  const hasCurrentGame = localGameRepository.loadActiveGame() !== null
  const screen = (
    <DecksScreen
      onPlay={() => router.replace({ pathname: "/", params: { destination: "play" } })}
      hasCurrentGame={hasCurrentGame}
      onSettings={() => router.push("/settings")}
      accountLabel={auth.isSignedIn ? "Account" : "Sign in"}
      onAccount={() => (auth.isSignedIn ? router.push("/account") : auth.openAuth())}
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
      unavailableMessage={
        !auth.configured
          ? auth.configurationMessage || "Deck sync is unavailable in this build."
          : auth.isLoaded && !auth.isSignedIn
            ? "Sign in to load your deck shelf. Offline decks are coming later."
            : undefined
      }
    />
  )
  if (!auth.configured || (auth.isLoaded && !auth.isSignedIn)) return screen
  return <ConnectedGate onBack={() => router.back()}>{screen}</ConnectedGate>
}
