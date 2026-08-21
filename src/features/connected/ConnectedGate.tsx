import { ReactNode, useEffect, useRef, useState } from "react"
import type { ViewStyle } from "react-native"
import { ActivityIndicator, Animated } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvex, useConvexAuth, useConvexConnectionState, useMutation } from "convex/react"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedErrorBoundary } from "@/features/connected/ConnectedErrorBoundary"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { ConnectedGameRepository } from "./persistence"
import { describeUsernameFailure, isUsernameValid, suggestUsername } from "./username"
import { UsernameChecklist } from "./UsernameChecklist"
import { api } from "../../../convex/_generated/api"

const LOADING_REVEAL_DELAY_MS = 200
const LOADING_FADE_DURATION_MS = 150

const syncedProfile: { userId?: string } = { userId: undefined }

export function resetSyncedProfileCacheForTests() {
  syncedProfile.userId = undefined
}

function useRevealAfterDelay(delayMs: number) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])
  return revealed
}

function GateScreen({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  const {
    theme: { colors },
    themed,
  } = useAppTheme()
  const revealedAfterDelay = useRevealAfterDelay(LOADING_REVEAL_DELAY_MS)
  const visible = !busy || revealedAfterDelay
  const opacity = useRef(new Animated.Value(busy ? 0 : 1)).current

  useEffect(() => {
    if (!visible) return
    Animated.timing(opacity, {
      toValue: 1,
      duration: LOADING_FADE_DURATION_MS,
      useNativeDriver: true,
    }).start()
  }, [opacity, visible])

  return (
    <Screen
      preset="auto"
      safeAreaEdges={["top", "bottom"]}
      contentInset="standard"
      contentContainerStyle={themed($gate)}
    >
      {visible ? (
        <Animated.View style={[themed($gateContent), { opacity }]}>
          {busy ? <ActivityIndicator color={colors.tint} /> : null}
          {children}
        </Animated.View>
      ) : null}
    </Screen>
  )
}

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
  const convex = useConvex()
  const [readyUserId, setReadyUserId] = useState<string | undefined>(syncedProfile.userId)
  const [syncError, setSyncError] = useState<string>()
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [username, setUsername] = useState("")
  const [usernameError, setUsernameError] = useState<string>()
  const [savingUsername, setSavingUsername] = useState(false)
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
          syncedProfile.userId = user.id
          setReadyUserId(user.id)
          setSyncError(undefined)
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          syncedProfile.userId = undefined
          setReadyUserId(undefined)
          setSyncError(cause instanceof Error ? cause.message : "Could not prepare connected play")
        }
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
      <GateScreen busy>
        <Text text="Checking your session… Local play remains available." />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (!clerkSignedIn)
    return (
      <GateScreen>
        <Text
          accessibilityRole="alert"
          text="You are signed out or your session expired. Re-authenticate to resume connected play; local games remain available."
        />
        <Button text="Re-authenticate" preset="reversed" onPress={onReauthenticate} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (isAuthenticated && isUserLoaded && user?.id && user.username === null)
    return (
      <GateScreen>
        <Text preset="heading" text="Choose your player username" />
        <Text text="Your unique @username identifies you in connected game history." />
        <TextField
          label="Username"
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={(next) => {
            setUsername(next)
            setUsernameError(undefined)
          }}
        />
        <UsernameChecklist username={username} />
        <Button
          text="Suggest a username"
          onPress={() => {
            setUsername(suggestUsername())
            setUsernameError(undefined)
          }}
        />
        {usernameError ? <Text accessibilityRole="alert" text={usernameError} /> : null}
        <Button
          text={savingUsername ? "Saving…" : "Save username"}
          preset="reversed"
          disabled={savingUsername || !isUsernameValid(username)}
          onPress={async () => {
            try {
              setSavingUsername(true)
              setUsernameError(undefined)
              const { acceptable } = await convex.query(api.moderation.usernameIsAcceptable, {
                username: username.trim(),
              })
              if (!acceptable) {
                setUsernameError(
                  "That username is not allowed. Other players will see this name, so please choose another.",
                )
                return
              }
              await user.update({ username: username.trim() })
            } catch (cause) {
              setUsernameError(describeUsernameFailure(cause))
            } finally {
              setSavingUsername(false)
            }
          }}
        />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (isAuthenticated && isUserLoaded && user?.id && readyUserId === user.id) return children
  if (!isWebSocketConnected)
    return (
      <GateScreen>
        <Text
          accessibilityRole="alert"
          text="Connected play is offline. Local play remains available."
        />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (isLoading)
    return (
      <GateScreen busy>
        <Text text="Connecting to Convex… Local play remains available." />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (!isAuthenticated)
    return (
      <GateScreen>
        <Text
          accessibilityRole="alert"
          text="Convex rejected this signed-in session. Check the issuer or deployment configuration, then retry."
        />
        <Button text="Re-authenticate" preset="reversed" onPress={onReauthenticate} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (syncError)
    return (
      <GateScreen>
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
      </GateScreen>
    )
  return (
    <GateScreen busy>
      <Text text="Preparing your connected-play profile…" />
      {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
    </GateScreen>
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
      <GateScreen>
        <Text accessibilityRole="alert" text={auth.configurationMessage} />
        {onBack ? <Button text="Back to local play" onPress={onBack} /> : null}
      </GateScreen>
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

const $gate: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  justifyContent: "center",
  paddingVertical: spacing.xl,
})
const $gateContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
