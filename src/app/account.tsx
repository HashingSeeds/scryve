import { useEffect, useState } from "react"
import { router } from "expo-router"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { AccountProfile } from "@/features/auth/AccountControls"
import { AccountDataControls } from "@/features/auth/AccountDataControls"
import { loadAccountDeletionReceiptToken } from "@/features/auth/accountDeletionReceiptStore"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { SubscriptionControls } from "@/features/billing/SubscriptionControls"
import { translate } from "@/i18n/translate"

export default function AccountRoute() {
  const auth = useAuthAccess()
  const leaveAccount = () => (router.canGoBack() ? router.back() : router.replace("/"))
  const openAccountData = () => router.push("/delete-account")
  // why: Clerk drops the session before signOut resolves, which remounts this route; it latches the sign-out so it keeps leaving after the flag clears instead of flashing the sign-in prompt.
  const [signedOutHere, setSignedOutHere] = useState(false)
  if (!signedOutHere && auth.signingOut && !auth.isSignedIn) setSignedOutHere(true)
  useEffect(() => {
    if (signedOutHere) router.dismissTo("/")
  }, [signedOutHere])
  if (signedOutHere)
    return (
      <Screen preset="fixed">
        <Header titleTx="account:profile.title" leftTx="common:back" />
      </Screen>
    )
  if (!auth.configured || !auth.isSignedIn) {
    const hasDeletionReceipt = auth.configured && loadAccountDeletionReceiptToken() !== undefined
    const prompt = auth.configurationMessage || translate("account:profile.signInPrompt")
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header
          titleTx="account:profile.title"
          leftTx="common:back"
          onLeftPress={() => router.back()}
        />
        <Text accessibilityRole="alert" text={prompt} />
        {auth.configured && !auth.isSignedIn ? (
          <Button tx="account:profile.reauthenticate" preset="primary" onPress={auth.openAuth} />
        ) : null}
        {hasDeletionReceipt ? <AccountDataControls onOpen={openAccountData} /> : null}
        <Button
          tx="account:openPlay"
          onPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )
  }
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
        onOpenTerms={() => router.push("/terms")}
        onOpenPrivacy={() => router.push("/privacy")}
        onOpenGameContentNotices={() => router.push("/game-content-notices")}
        onSigningOut={auth.setSigningOut}
      />
    </Screen>
  )
}

const $profileScreen = { flex: 1 } as const
