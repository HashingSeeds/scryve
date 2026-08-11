import { router } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedHostSource } from "@/features/connected/ConnectedHostSource"
import { localGameRepository } from "@/features/game/localPersistence"
import { NewGameScreen } from "@/screens/NewGameScreen"

export default function NewConnectedGameRoute() {
  return (
    <ConnectedGate onBack={() => router.replace("/connected")}>
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
            onModeChange={(mode) => mode === "local" && router.replace("/game/new")}
            onBack={() => router.back()}
            onStartLocal={() => undefined}
            connected={connected}
          />
        )}
      </ConnectedHostSource>
    </ConnectedGate>
  )
}
