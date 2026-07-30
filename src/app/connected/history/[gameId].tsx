import { router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedHistoryDetailScreen } from "@/screens/ConnectedHistoryDetailScreen"

export default function ConnectedHistoryDetailRoute() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>()
  return (
    <ConnectedGate onBack={() => router.back()}>
      <ConnectedHistoryDetailScreen publicId={gameId} onBack={() => router.back()} />
    </ConnectedGate>
  )
}
