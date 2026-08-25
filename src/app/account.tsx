import { router } from "expo-router"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { AccountProfile } from "@/features/auth/AccountControls"
import { AccountDataControls } from "@/features/auth/AccountDataControls"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { SubscriptionControls } from "@/features/billing/SubscriptionControls"

export default function AccountRoute() {
  const auth = useAuthAccess()
  const leaveAccount = () => (router.canGoBack() ? router.back() : router.replace("/"))
  const openAccountData = () => {
    if (auth.isSignedIn) router.push("/delete-account")
  }
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
    <Screen preset="fixed" contentContainerStyle={$profileScreen}>
      <AccountProfile
        accountControls={
          <>
            <SubscriptionControls />
            <AccountDataControls onOpen={openAccountData} />
          </>
        }
        onBack={leaveAccount}
        onSignedOut={() => router.replace("/")}
      />
    </Screen>
  )
}

const $profileScreen = { flex: 1 } as const
