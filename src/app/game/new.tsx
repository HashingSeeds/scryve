import { router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedHostSource } from "@/features/connected/ConnectedHostSource"
import { localGameRepository } from "@/features/game/localPersistence"
import { ActiveGameGuardScreen } from "@/screens/ActiveGameGuardScreen"
import { NewGameScreen } from "@/screens/NewGameScreen"

export default function NewLocalGameRoute() {
  const { mode, setup } = useLocalSearchParams<{ mode?: string; setup?: string }>()
  if (mode === "connected") {
    return (
      <ConnectedGate onBack={() => router.back()}>
        <ConnectedHostSource
          onLobbyCreated={(lobby) =>
            router.replace({
              pathname: "/connected/lobby/[gameId]",
              params: { gameId: lobby.publicId },
            })
          }
        >
          {(connected) => (
            <NewGameScreen
              defaults={localGameRepository.loadSettings()}
              mode="connected"
              onModeChange={(nextMode) => nextMode === "local" && router.replace("/game/new")}
              onBack={() => router.back()}
              onStartLocal={() => undefined}
              connected={connected}
            />
          )}
        </ConnectedHostSource>
      </ConnectedGate>
    )
  }
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
      onModeChange={(nextMode) =>
        nextMode === "connected" && router.replace("/game/new?mode=connected")
      }
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
