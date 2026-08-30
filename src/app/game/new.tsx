import { router } from "expo-router"

import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { ActiveGameGuardScreen } from "@/screens/ActiveGameGuardScreen"
import { NewGameScreen } from "@/screens/NewGameScreen"

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
    <NewGameScreen
      defaults={localGameRepository.loadSettings()}
      mode="local"
      onModeChange={(mode) => mode === "connected" && router.replace("/connected/new")}
      onBack={() => router.back()}
      onStartLocal={(players, startingLife, setup) => {
        const game = createLocalGame({ players, startingLife, ...setup })
        localGameRepository.saveActiveGame(game)
        router.replace("/game/current")
      }}
    />
  )
}
