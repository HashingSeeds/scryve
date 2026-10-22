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
          <Button tx="account:profile.reauthenticate" preset="reversed" onPress={auth.openAuth} />
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
        onSignedOut={() => router.dismissTo("/")}
      />
    </Screen>
  )
}

const $profileScreen = { flex: 1 } as const
