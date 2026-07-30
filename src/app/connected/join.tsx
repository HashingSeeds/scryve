import { router, useLocalSearchParams } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { JoinConnectedScreen } from "@/screens/JoinConnectedScreen"

export default function JoinRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  return (
    <ConnectedGate onBack={() => router.replace("/")}>
      <JoinConnectedScreen
        initialCode={code}
        onBack={() => router.back()}
        onScan={() => router.push("/connected/scan")}
        onJoined={(id) =>
          router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: id } })
        }
      />
    </ConnectedGate>
  )
}
