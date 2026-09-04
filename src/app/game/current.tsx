import { router } from "expo-router"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { localGameRepository } from "@/features/game/localPersistence"
import { CurrentGameScreen } from "@/screens/CurrentGameScreen"

export default function CurrentLocalGameRoute() {
  const game = localGameRepository.loadActiveGame()
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
      onDecks={() => router.push("/connected/decks")}
      onHistory={() => router.push("/history")}
      onSetup={() => router.push("/game/new?setup=1")}
      onConnect={() => router.push("/connected")}
      onSettings={() => router.push("/settings")}
      onAccount={() => router.push("/account")}
      onGameEnded={(gameId) =>
        router.replace({ pathname: "/history/[gameId]", params: { gameId } })
      }
      onGameAbandoned={() => router.replace({ pathname: "/", params: { destination: "play" } })}
    />
  )
}
