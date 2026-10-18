import { router, useLocalSearchParams } from "expo-router"

import { CloudScreen } from "@/features/auth/CloudScreen"
import { NearbyGameList } from "@/features/lan/NearbyGameList"
import { JoinConnectedScreen } from "@/screens/JoinConnectedScreen"

export default function JoinRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  return (
    <CloudScreen multiplayer onBack={() => router.dismissTo("/")}>
      {(access) => (
        <JoinConnectedScreen
          access={access}
          initialCode={code}
          nearby={<NearbyGameList onJoin={() => router.push("/lan")} />}
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
