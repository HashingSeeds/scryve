import { useState } from "react"
import { router } from "expo-router"
import { useUser } from "@clerk/expo"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { type AccountDeletionStatus, DeleteAccountScreen } from "@/screens/DeleteAccountScreen"

import { api } from "../../convex/_generated/api"

export default function DeleteAccountRoute() {
  const auth = useAuthAccess()
  const [requestStarted, setRequestStarted] = useState(false)
  if (!auth.configured || !auth.isSignedIn)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]}>
        <Header title="Delete account" leftTx="common:back" onLeftPress={() => router.back()} />
        <Text
          accessibilityRole="alert"
          text={
            requestStarted
              ? "Your account deletion request was received."
              : auth.configurationMessage || "Sign in to request deletion of your Count account."
          }
        />
        {auth.configured && !requestStarted ? (
          <Button text="Sign in" preset="reversed" onPress={auth.openAuth} />
        ) : null}
        <Button text="Return home" onPress={() => router.replace("/")} />
      </Screen>
    )
  return <AuthenticatedDeleteAccountRoute onRequestStarted={() => setRequestStarted(true)} />
}

function AuthenticatedDeleteAccountRoute({ onRequestStarted }: { onRequestStarted: () => void }) {
  const { isLoaded: isUserLoaded, user } = useUser()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const requestDeletion = useMutation(api.accountDeletion.requestCurrentAccountDeletion)
  const deletion = useQuery(api.accountDeletion.currentAccountDeletion)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()

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
        <Text accessibilityRole="alert" text="Reconnect to Count before deleting your account." />
        <Button text="Return home" onPress={() => router.replace("/")} />
      </Screen>
    )

  const submit = async () => {
    setIsSubmitting(true)
    setError(undefined)
    try {
      await requestDeletion({ confirmation: "DELETE" })
      onRequestStarted()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the deletion request")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DeleteAccountScreen
      email={user?.primaryEmailAddress?.emailAddress}
      deletionStatus={deletion?.status as AccountDeletionStatus | undefined}
      isSubmitting={isSubmitting}
      error={error}
      onBack={() => router.back()}
      onRequestDeletion={submit}
    />
  )
}
