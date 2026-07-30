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
          content="Start a new game from the home screen."
          button="Return home"
          buttonOnPress={() => router.replace("/")}
        />
      </Screen>
    )
  }
  return (
    <CurrentGameScreen
      initialGame={game}
      onHome={() => router.replace("/")}
      onGameEnded={(gameId) =>
        router.replace({ pathname: "/history/[gameId]", params: { gameId } })
      }
    />
  )
}
