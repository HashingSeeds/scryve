import { useCallback, useEffect, useState } from "react"
import { router, type ErrorBoundaryProps } from "expo-router"
import { useClerk, useUser } from "@clerk/expo"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import {
  clearAccountDeletionReceiptToken,
  isValidReceiptToken,
  loadAccountDeletionReceiptToken,
  saveAccountDeletionReceiptToken,
} from "@/features/auth/accountDeletionReceiptStore"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { writeSessionHint } from "@/features/auth/sessionHint"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { translate } from "@/i18n/translate"
import { AccountDeletionReceiptScreen, DeleteAccountScreen } from "@/screens/DeleteAccountScreen"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen preset="auto" safeAreaEdges={["bottom"]}>
      <Header
        titleTx="account:deleteAccount.title"
        leftTx="common:back"
        onLeftPress={() => router.back()}
      />
      <Text accessibilityRole="alert" tx="account:deleteAccount.route.statusCheckFailed" />
      <Button tx="common:tryAgain" preset="reversed" onPress={() => void retry()} />
      <Button
        tx="account:openPlay"
        onPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
      />
    </Screen>
  )
}

export default function DeleteAccountRoute() {
  const auth = useAuthAccess()
  const [receiptToken, setReceiptToken] = useState(loadAccountDeletionReceiptToken)
  const rememberReceipt = useCallback((token: string) => {
    if (!isValidReceiptToken(token)) return
    if (loadAccountDeletionReceiptToken() !== token) {
      new LocalGameRepository().resetAnalyticsId()
      saveAccountDeletionReceiptToken(token)
    }
    setReceiptToken(token)
  }, [])
  const signInPrompt =
    auth.configurationMessage || translate("account:deleteAccount.route.signInPrompt")
  if (!auth.configured || !auth.isSignedIn)
    if (auth.configured && receiptToken)
      return (
        <SignedOutDeletionReceipt
          receiptToken={receiptToken}
          onReceiptMissing={() => {
            clearAccountDeletionReceiptToken()
            setReceiptToken(undefined)
          }}
          onSignIn={auth.openAuth}
        />
      )
    else
      return (
        <Screen preset="auto" safeAreaEdges={["bottom"]}>
          <Header
            titleTx="account:deleteAccount.title"
            leftTx="common:back"
            onLeftPress={() => router.back()}
          />
          <Text accessibilityRole="alert" text={signInPrompt} />
          {auth.configured ? (
            <Button tx="account:signIn" preset="reversed" onPress={auth.openAuth} />
          ) : null}
          <Button
            tx="account:openPlay"
            onPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
          />
        </Screen>
      )
  return <AuthenticatedDeleteAccountRoute onReceipt={rememberReceipt} />
}

function SignedOutDeletionReceipt({
  receiptToken,
  onReceiptMissing,
  onSignIn,
}: {
  receiptToken: string
  onReceiptMissing: () => void
  onSignIn: () => void
}) {
  const receipt = useQuery(api.accountDeletion.deletionReceipt, { receiptToken })

  useEffect(() => {
    if (receipt === null) onReceiptMissing()
  }, [onReceiptMissing, receipt])

  if (receipt === undefined || receipt === null)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header
          titleTx="account:deleteAccount.title"
          leftTx="common:back"
          onLeftPress={() => router.back()}
        />
        <Text tx="account:deleteAccount.route.checkingReceipt" accessibilityLiveRegion="polite" />
        <Button
          tx="account:openPlay"
          onPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )

  return (
    <AccountDeletionReceiptScreen
      status={receipt.status}
      updatedAt={receipt.updatedAt}
      onBack={() => router.back()}
      onSignIn={receipt.canRetry ? onSignIn : undefined}
      onReturnHome={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
    />
  )
}

function AuthenticatedDeleteAccountRoute({ onReceipt }: { onReceipt: (token: string) => void }) {
  const { isLoaded: isUserLoaded, user } = useUser()
  const clerk = useClerk()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const requestDeletion = useMutation(api.accountDeletion.requestCurrentAccountDeletion)
  const deletion = useQuery(api.accountDeletion.currentAccountDeletion)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (deletion?.receiptToken) onReceipt(deletion.receiptToken)
  }, [deletion?.receiptToken, onReceipt])

  if (isLoading || !isUserLoaded)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header
          titleTx="account:deleteAccount.title"
          leftTx="common:back"
          onLeftPress={() => router.back()}
        />
        <Text tx="account:deleteAccount.route.checkingAccount" />
      </Screen>
    )
  if (!isAuthenticated)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header
          titleTx="account:deleteAccount.title"
          leftTx="common:back"
          onLeftPress={() => router.back()}
        />
        <Text accessibilityRole="alert" tx="account:deleteAccount.route.reconnect" />
        <Button
          tx="account:openPlay"
          onPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )

  const submit = async () => {
    setIsSubmitting(true)
    setError(undefined)
    try {
      const result = await requestDeletion({ confirmation: "DELETE" })
      onReceipt(result.receiptToken)
      writeSessionHint({ userId: null })
      await clerk.signOut()
    } catch (cause) {
      setError(
        convexErrorMessage(
          cause,
          cause instanceof Error
            ? cause.message
            : translate("account:deleteAccount.route.submitFailed"),
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DeleteAccountScreen
      email={user?.primaryEmailAddress?.emailAddress}
      deletionStatus={deletion === undefined ? undefined : (deletion?.status ?? null)}
      isSubmitting={isSubmitting}
      error={error}
      onBack={() => router.back()}
      onRequestDeletion={submit}
    />
  )
}
