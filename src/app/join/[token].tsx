import { router, useLocalSearchParams } from "expo-router"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { CloudScreen } from "@/features/auth/CloudScreen"
import { isInviteToken } from "@/features/connected/inviteLinks"
import { JoinConnectedScreen } from "@/screens/JoinConnectedScreen"

export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>()
  if (!isInviteToken(token ?? "")) {
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <Header
          titleTx="connected:invalidInvite.header"
          leftTx="common:back"
          onLeftPress={() => router.dismissTo("/")}
        />
        <Text preset="heading" accessibilityRole="header" tx="connected:invalidInvite.title" />
        <Text accessibilityRole="alert" tx="connected:invalidInvite.message" />
        <Button
          tx="connected:invalidInvite.enterCode"
          onPress={() => router.replace("/connected/join")}
        />
        <Button
          tx="connected:invalidInvite.openPlay"
          onPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )
  }
  return (
    <CloudScreen multiplayer onBack={() => router.dismissTo("/")}>
      {(access) => (
        <JoinConnectedScreen
          access={access}
          inviteToken={token}
          onBack={() => router.dismissTo("/")}
          onJoined={(id) =>
            router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: id } })
          }
        />
      )}
    </CloudScreen>
  )
}
