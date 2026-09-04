import { router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedLobbyScreen } from "@/screens/ConnectedLobbyScreen"

export default function LobbyRoute() {
  const params = useLocalSearchParams<{ gameId: string }>()
  return (
    <ConnectedGate onBack={() => router.replace("/game/new?mode=connected")}>
      <ConnectedLobbyScreen
        publicId={params.gameId}
        onBack={() => router.replace("/game/new?mode=connected")}
        onLeft={() => router.replace("/game/new?mode=connected")}
        onStarted={() =>
          router.replace({
            pathname: "/connected/game/[gameId]",
            params: { gameId: params.gameId },
          })
        }
      />
    </ConnectedGate>
  )
}
