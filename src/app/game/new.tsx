import { router } from "expo-router"

import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { ActiveGameGuardScreen } from "@/screens/ActiveGameGuardScreen"
import { GameSetupScreen } from "@/screens/GameSetupScreen"

export default function NewLocalGameRoute() {
  if (localGameRepository.loadActiveGame()) {
    return (
      <ActiveGameGuardScreen
        onBack={() => router.back()}
        onResume={() => router.replace("/game/current")}
      />
    )
  }
  return (
    <GameSetupScreen
      defaults={localGameRepository.loadSettings()}
      onBack={() => router.back()}
      onStart={(players, startingLife) => {
        const game = createLocalGame({ players, startingLife })
        localGameRepository.saveActiveGame(game)
        router.replace("/game/current")
      }}
    />
  )
}
