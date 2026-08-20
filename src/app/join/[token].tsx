import { router, useLocalSearchParams } from "expo-router"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
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
        <Button text="Return home" onPress={() => router.replace("/")} />
      </Screen>
    )
  }
  return (
    <ConnectedGate onBack={() => router.replace("/")}>
      <JoinConnectedScreen
        inviteToken={token}
        onBack={() => router.replace("/")}
        onJoined={(id) =>
          router.replace({ pathname: "/connected/lobby/[gameId]", params: { gameId: id } })
        }
      />
    </ConnectedGate>
  )
}
