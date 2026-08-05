import { router } from "expo-router"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { AccountProfile } from "@/features/auth/AccountControls"
import { useAuthAccess } from "@/features/auth/AuthContext"

export default function AccountRoute() {
  const auth = useAuthAccess()
  if (!auth.configured || !auth.isSignedIn)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header title="Account" leftTx="common:back" onLeftPress={() => router.back()} />
        <Text
          accessibilityRole="alert"
          text={auth.configurationMessage || "Sign in before opening your profile."}
        />
        {auth.configured && !auth.isSignedIn ? (
          <Button text="Re-authenticate" preset="reversed" onPress={auth.openAuth} />
        ) : null}
        <Button text="Return home" onPress={() => router.replace("/")} />
      </Screen>
    )
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={$profileScreen}>
      <Header title="Account" leftTx="common:back" onLeftPress={() => router.back()} />
      <AccountProfile />
    </Screen>
  )
}

const $profileScreen = { flex: 1 } as const
