import { useCallback, useState } from "react"
import { router, useFocusEffect } from "expo-router"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { hasLocalGameStarted } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { CurrentGameScreen } from "@/screens/CurrentGameScreen"

export default function CurrentLocalGameRoute() {
  const auth = useAuthAccess()
  const [game, setGame] = useState(() => localGameRepository.loadActiveGame())
  // why: setup can rename or end this game while the board waits underneath; the board adopts what this reads.
  useFocusEffect(useCallback(() => setGame(localGameRepository.loadActiveGame()), []))
  if (!game) {
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <EmptyState
          heading="No active local game"
          content="Your next game is ready on Play."
          button="Open Play"
          buttonOnPress={() => router.replace({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )
  }
  return (
    <CurrentGameScreen
      initialGame={game}
      fresh={!hasLocalGameStarted(game)}
      onDecks={() => router.push("/connected/decks")}
      onHistory={() => router.push("/history")}
      onSetup={() => router.push("/game/new?setup=1")}
      onConnect={() => router.push("/game/new?mode=connected")}
      onSettings={() => router.push("/settings")}
      onAccount={() => router.push("/account")}
      onViewSummary={(gameId) => router.push({ pathname: "/history/[gameId]", params: { gameId } })}
      onGameAbandoned={() => router.replace({ pathname: "/", params: { destination: "play" } })}
      ownerId={auth.isSignedIn ? auth.userId : undefined}
    />
  )
}
