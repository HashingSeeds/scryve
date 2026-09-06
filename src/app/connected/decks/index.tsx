import { useMemo } from "react"
import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { localGameRepository } from "@/features/game/localPersistence"
import { DecksScreen } from "@/screens/DecksScreen"

export default function DecksRoute() {
  const auth = useAuthAccess()
  const hasCurrentGame = useMemo(() => localGameRepository.loadActiveGame() !== null, [])
  const screen = (access?: CloudAccess) => (
    <DecksScreen
      access={access}
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
          : undefined
      }
    />
  )
  if (!auth.configured) return screen()
  return <CloudScreen onBack={() => router.back()}>{screen}</CloudScreen>
}
