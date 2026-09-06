import { router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { JoinConnectedScreen } from "@/screens/JoinConnectedScreen"

export default function JoinRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  return (
    <CloudScreen multiplayer onBack={() => router.replace("/")}>
      {(access) => (
        <JoinConnectedScreen
          access={access}
          initialCode={code}
          onBack={() => router.back()}
          onScan={() => router.push("/connected/scan")}
          onJoined={(id) =>
            router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: id } })
          }
        />
      )}
    </CloudScreen>
  )
}
