import { useCallback, useEffect, useRef, useState } from "react"
import { router, type ErrorBoundaryProps } from "expo-router"
import { useUser } from "@clerk/expo"
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
import { LocalGameRepository } from "@/features/game/localPersistence"
import { AccountDeletionReceiptScreen, DeleteAccountScreen } from "@/screens/DeleteAccountScreen"

import { api } from "../../convex/_generated/api"

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen preset="auto" safeAreaEdges={["bottom"]}>
      <Header title="Delete account" leftTx="common:back" onLeftPress={() => router.back()} />
      <Text
        accessibilityRole="alert"
        text="Scryve couldn't check your deletion status. Account deletion stays unavailable until the check succeeds."
      />
      <Button text="Try again" preset="reversed" onPress={() => void retry()} />
      <Button text="Return home" onPress={() => router.replace("/")} />
    </Screen>
  )
}

export default function DeleteAccountRoute() {
  const auth = useAuthAccess()
  const [receiptToken, setReceiptToken] = useState(loadAccountDeletionReceiptToken)
  const analyticsIdRotatedForToken = useRef<string | undefined>(undefined)
  const rememberReceipt = useCallback((token: string) => {
    if (!isValidReceiptToken(token)) return
    if (analyticsIdRotatedForToken.current !== token) {
      analyticsIdRotatedForToken.current = token
      new LocalGameRepository().resetAnalyticsId()
    }
    setReceiptToken(token)
    saveAccountDeletionReceiptToken(token)
  }, [])
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
          <Header title="Delete account" leftTx="common:back" onLeftPress={() => router.back()} />
          <Text
            accessibilityRole="alert"
            text={
              auth.configurationMessage || "Sign in to request deletion of your Scryve account."
            }
          />
          {auth.configured ? (
            <Button text="Sign in" preset="reversed" onPress={auth.openAuth} />
          ) : null}
          <Button text="Return home" onPress={() => router.replace("/")} />
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
        <Header title="Delete account" leftTx="common:back" onLeftPress={() => router.back()} />
        <Text text="Checking your deletion receipt…" accessibilityLiveRegion="polite" />
        <Button text="Return home" onPress={() => router.replace("/")} />
      </Screen>
    )

  return (
    <AccountDeletionReceiptScreen
      status={receipt.status}
      updatedAt={receipt.updatedAt}
      onBack={() => router.back()}
      onSignIn={receipt.canRetry ? onSignIn : undefined}
      onReturnHome={() => router.replace("/")}
    />
  )
}

function AuthenticatedDeleteAccountRoute({ onReceipt }: { onReceipt: (token: string) => void }) {
  const { isLoaded: isUserLoaded, user } = useUser()
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
        <Header title="Delete account" leftTx="common:back" onLeftPress={() => router.back()} />
        <Text text="Checking your account…" />
      </Screen>
    )
  if (!isAuthenticated)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header title="Delete account" leftTx="common:back" onLeftPress={() => router.back()} />
        <Text accessibilityRole="alert" text="Reconnect to Scryve before deleting your account." />
        <Button text="Return home" onPress={() => router.replace("/")} />
      </Screen>
    )

  const submit = async () => {
    setIsSubmitting(true)
    setError(undefined)
    try {
      const result = await requestDeletion({ confirmation: "DELETE" })
      onReceipt(result.receiptToken)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the deletion request")
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
