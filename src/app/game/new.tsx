import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { ActiveGameGuardScreen } from "@/screens/ActiveGameGuardScreen"
import { NewGameScreen } from "@/screens/NewGameScreen"

export default function NewLocalGameRoute() {
  const auth = useAuthAccess()
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
      username={auth.isSignedIn ? auth.username : undefined}
      onModeChange={(mode) => mode === "connected" && router.replace("/connected/new")}
      onBack={() => router.back()}
      onStartLocal={(players, startingLife) => {
        const game = createLocalGame({ players, startingLife })
        localGameRepository.saveActiveGame(game)
        router.replace("/game/current")
      }}
    />
  )
}
