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
        <Header title="Invitation" leftTx="common:back" onLeftPress={() => router.replace("/")} />
        <Text preset="heading" accessibilityRole="header" text="Invalid invitation" />
        <Text
          accessibilityRole="alert"
          text="This Scryve invitation is malformed or incomplete. Ask the host for a new link or enter the 6-character code."
        />
        <Button text="Enter a manual code" onPress={() => router.replace("/connected/join")} />
        <Button
          text="Open Play"
          onPress={() => router.replace({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )
  }
  return (
    <CloudScreen multiplayer onBack={() => router.replace("/")}>
      {(access) => (
        <JoinConnectedScreen
          access={access}
          inviteToken={token}
          onBack={() => router.replace("/")}
          onJoined={(id) =>
            router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: id } })
          }
        />
      )}
    </CloudScreen>
  )
}
