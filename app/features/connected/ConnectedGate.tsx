import { ReactNode, useEffect, useState } from "react"
import { useUser } from "@clerk/expo"
import { useConvexAuth, useConvexConnectionState, useMutation } from "convex/react"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedErrorBoundary } from "@/features/connected/ConnectedErrorBoundary"

import { ConnectedGameRepository } from "./persistence"
import { api } from "../../../convex/_generated/api"

export function BackendGate({
  children,
  allowOfflineBootstrap = false,
  offlineGameId,
  clerkLoaded,
  clerkSignedIn,
  onBack,
  onReauthenticate,
}: {
  children: ReactNode
  allowOfflineBootstrap?: boolean
  offlineGameId?: string
  clerkLoaded: boolean
  clerkSignedIn: boolean
  onBack?: () => void
  onReauthenticate: () => void
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const { isLoaded: isUserLoaded, user } = useUser()
  const syncCurrent = useMutation(api.users.syncCurrent)
  const [readyUserId, setReadyUserId] = useState<string>()
  const [syncError, setSyncError] = useState<string>()
  const [syncAttempt, setSyncAttempt] = useState(0)
  const cachedProjection =
    allowOfflineBootstrap && !isWebSocketConnected && offlineGameId && isUserLoaded && user?.id
      ? new ConnectedGameRepository(undefined, user.id).loadProjection(offlineGameId)
      : null
  const hasOwnerScopedCache = Boolean(offlineGameId && cachedProjection?.publicId === offlineGameId)

  useEffect(() => {
    if (!clerkSignedIn || !isAuthenticated || !isWebSocketConnected || !user?.id) return
    let cancelled = false
    const displayName = user.fullName || user.firstName || "Player"
    void syncCurrent({ displayName, avatarUrl: user.imageUrl })
      .then(() => {
        if (!cancelled) {
          setReadyUserId(user.id)
          setSyncError(undefined)
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setSyncError(cause instanceof Error ? cause.message : "Could not prepare connected play")
      })
    return () => {
      cancelled = true
    }
  }, [
    isAuthenticated,
    isWebSocketConnected,
    clerkSignedIn,
    syncCurrent,
    syncAttempt,
    user?.firstName,
    user?.fullName,
    user?.id,
    user?.imageUrl,
  ])
  if (clerkSignedIn && !isWebSocketConnected && hasOwnerScopedCache) return children
  if (!clerkLoaded)
    return (
      <Screen preset="auto">
        <Text text="Checking your session… Local play remains available." />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  if (!clerkSignedIn)
    return (
      <Screen preset="auto">
        <Text
          accessibilityRole="alert"
          text="You are signed out or your session expired. Re-authenticate to resume connected play; local games remain available."
        />
        <Button text="Re-authenticate" preset="reversed" onPress={onReauthenticate} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  if (isAuthenticated && isUserLoaded && user?.id && readyUserId === user.id) return children
  if (!isWebSocketConnected)
    return (
      <Screen preset="auto">
        <Text
          accessibilityRole="alert"
          text="Connected play is offline. Local play remains available."
        />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  if (isLoading)
    return (
      <Screen preset="auto">
        <Text text="Connecting to Convex… Local play remains available." />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  if (!isAuthenticated)
    return (
      <Screen preset="auto">
        <Text
          accessibilityRole="alert"
          text="Convex rejected this signed-in session. Check the issuer or deployment configuration, then retry."
        />
        <Button text="Re-authenticate" preset="reversed" onPress={onReauthenticate} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  if (syncError)
    return (
      <Screen preset="auto">
        <Text accessibilityRole="alert" text={syncError} />
        <Button
          text="Retry connected setup"
          preset="reversed"
          onPress={() => {
            setSyncError(undefined)
            setSyncAttempt((attempt) => attempt + 1)
          }}
        />
        <Button text="Re-authenticate" onPress={onReauthenticate} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  return (
    <Screen preset="auto">
      <Text text="Preparing your connected-play profile…" />
      {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
    </Screen>
  )
}

export function ConnectedGate({
  children,
  onBack,
  allowOfflineBootstrap,
  offlineGameId,
}: {
  children: ReactNode
  onBack?: () => void
  allowOfflineBootstrap?: boolean
  offlineGameId?: string
}) {
  const auth = useAuthAccess()
  if (!auth.configured)
    return (
      <Screen preset="auto">
        <Text accessibilityRole="alert" text={auth.configurationMessage} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </Screen>
    )
  return (
    <ConnectedErrorBoundary onBack={onBack}>
      <BackendGate
        allowOfflineBootstrap={allowOfflineBootstrap}
        offlineGameId={offlineGameId}
        clerkLoaded={auth.isLoaded}
        clerkSignedIn={auth.isSignedIn}
        onBack={onBack}
        onReauthenticate={auth.openAuth}
      >
        {children}
      </BackendGate>
    </ConnectedErrorBoundary>
  )
}
