import { useState } from "react"
import type { ViewStyle } from "react-native"
import { ScrollView } from "react-native"
import { router, useLocalSearchParams } from "expo-router"

import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { CloudScreen } from "@/features/auth/CloudScreen"
import { lanPlayAvailable } from "@/features/lan/lanAvailability"
import { NearbyGameList } from "@/features/lan/NearbyGameList"
import { JoinConnectedScreen } from "@/screens/JoinConnectedScreen"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

const openNearbyLobby = () => router.push("/lan")

export default function JoinRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const { configured } = useAuthAccess()
  // why: cloud and nearby games share the code field, so a typed or scanned code joins whichever game is on this Wi-Fi.
  const [typed, setTyped] = useState(code)
  if (!configured && lanPlayAvailable()) return <NearbyOnlyJoin code={code} />
  return (
    <CloudScreen multiplayer onBack={() => router.dismissTo("/")}>
      {(access) => (
        <JoinConnectedScreen
          access={access}
          initialCode={code}
          onCodeChange={setTyped}
          nearby={<NearbyGameList code={typed} onJoin={openNearbyLobby} />}
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

function NearbyOnlyJoin({ code }: { code?: string }) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={$styles.flex1}>
      <Header leftTx="common:back" onLeftPress={() => router.back()} />
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($content)}>
        <NearbyGameList code={code} onJoin={openNearbyLobby} />
      </ScrollView>
    </Screen>
  )
}

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({ padding: spacing.lg })
