import { router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedBoardScreen } from "@/screens/ConnectedBoardScreen"

export default function ConnectedGameRoute() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>()
  return (
    <ConnectedGate
      allowOfflineBootstrap
      offlineGameId={gameId}
      onBack={() => router.replace("/connected")}
    >
      <ConnectedBoardScreen
        publicId={gameId}
        onBack={() => router.replace("/connected")}
        onHistory={() => router.push({ pathname: "/history", params: { source: "connected" } })}
      />
    </ConnectedGate>
  )
}
