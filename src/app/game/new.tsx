import { router, useLocalSearchParams } from "expo-router"

import { localGameRepository } from "@/features/game/localPersistence"
import { ActiveGameGuardScreen } from "@/screens/ActiveGameGuardScreen"
import { NewGameScreen } from "@/screens/NewGameScreen"

export default function NewLocalGameRoute() {
  const { setup } = useLocalSearchParams<{ setup?: string }>()
  const activeGame = localGameRepository.loadActiveGame()
  const changingCurrentSetup = setup === "1" && activeGame !== null
  if (activeGame && !changingCurrentSetup) {
    return (
      <ActiveGameGuardScreen
        onBack={() => router.back()}
        onResume={() => router.replace("/game/current")}
      />
    )
  }
  return (
    <NewGameScreen
      defaults={
        activeGame
          ? {
              ...localGameRepository.loadSettings(),
              defaultPlayerCount: activeGame.players.length,
              defaultStartingLife: activeGame.startingLife,
            }
          : localGameRepository.loadSettings()
      }
      mode="local"
      localSubmitText={changingCurrentSetup ? "Apply and reset" : undefined}
      initialGame={changingCurrentSetup ? activeGame : undefined}
      confirmLocalSubmit={changingCurrentSetup}
      onModeChange={(mode) => mode === "connected" && router.replace("/connected/new")}
      onBack={() => router.back()}
      onStartLocal={(players, startingLife, setup) => {
        if (changingCurrentSetup) localGameRepository.clearActiveGame()
        router.replace({
          pathname: "/",
          params: {
            destination: "play",
            prepared: JSON.stringify({ players, startingLife, ...setup }),
          },
        })
      }}
    />
  )
}
