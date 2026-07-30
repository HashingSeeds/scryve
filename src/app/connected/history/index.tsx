import { router } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedHistoryScreen } from "@/screens/ConnectedHistoryScreen"

export default function ConnectedHistoryRoute() {
  return (
    <ConnectedGate onBack={() => router.back()}>
      <ConnectedHistoryScreen
        onBack={() => router.back()}
        onSelect={(gameId) =>
          router.push({ pathname: "/connected/history/[gameId]", params: { gameId } })
        }
      />
    </ConnectedGate>
  )
}
