import {
  type MutableRefObject,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { ViewStyle } from "react-native"
import { ActivityIndicator, Animated } from "react-native"
import { useUser } from "@clerk/expo"
import { useConvex, useConvexAuth } from "convex/react"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedErrorBoundary } from "@/features/connected/ConnectedErrorBoundary"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { ConnectedGameRepository } from "./persistence"
import { ConnectedProfileProvider, useConnectedProfile } from "./useConnectedProfile"
import { describeUsernameFailure, isUsernameValid, suggestUsername } from "./username"
import { UsernameChecklist } from "./UsernameChecklist"
import { api } from "../../../convex/_generated/api"

const LOADING_REVEAL_DELAY_MS = 200
const LOADING_FADE_DURATION_MS = 150

function useRevealAfterDelay(delayMs: number) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])
  return revealed
}

function ConnectedContentShownTo({
  userId,
  shownToRef,
  children,
}: {
  userId: string | undefined
  shownToRef: MutableRefObject<string | undefined>
  children: ReactNode
}) {
  useLayoutEffect(() => {
    shownToRef.current = userId
    return () => {
      if (shownToRef.current === userId) shownToRef.current = undefined
    }
  }, [shownToRef, userId])
  return children
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
  allowPendingProfile = false,
  offlineGameId,
  clerkLoaded,
  clerkSignedIn,
  hintedUserId,
  onBack,
  onReauthenticate,
}: {
  children: ReactNode
  allowPendingProfile?: boolean
  allowOfflineBootstrap?: boolean
  offlineGameId?: string
  clerkLoaded: boolean
  clerkSignedIn: boolean
  hintedUserId?: string
  onBack?: () => void
  onReauthenticate: () => void
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { isLoaded: isUserLoaded, user } = useUser()
  const convex = useConvex()
  const connectedProfile = useConnectedProfile()
  const [username, setUsername] = useState("")
  const [usernameError, setUsernameError] = useState<string>()
  const [savingUsername, setSavingUsername] = useState(false)
  const offlineProfile =
    connectedProfile.status === "offline" ? connectedProfile.profile : undefined
  const restoringUserId = clerkLoaded ? undefined : hintedUserId
  const cacheOwnerId = isUserLoaded ? offlineProfile?.userId : restoringUserId
  const cachedProjection =
    allowOfflineBootstrap && offlineGameId && cacheOwnerId
      ? new ConnectedGameRepository(undefined, cacheOwnerId).loadProjection(offlineGameId)
      : null
  const hasOwnerScopedCache = Boolean(offlineGameId && cachedProjection?.publicId === offlineGameId)
  const userShownConnectedContent = useRef<string | undefined>(undefined)
  const showChildren = (userId: string | undefined) => (
    <ConnectedContentShownTo userId={userId} shownToRef={userShownConnectedContent}>
      {children}
    </ConnectedContentShownTo>
  )
  const profileIsReconnecting =
    connectedProfile.status === "offline" || connectedProfile.status === "loading"
  const activeUserId = user?.id ?? offlineProfile?.userId
  const keepShowingConnectedContent =
    clerkSignedIn &&
    profileIsReconnecting &&
    activeUserId !== undefined &&
    userShownConnectedContent.current === activeUserId

  if (keepShowingConnectedContent) return showChildren(activeUserId)
  if (clerkSignedIn && connectedProfile.status === "offline" && hasOwnerScopedCache)
    return showChildren(offlineProfile?.userId)
  if (restoringUserId && hasOwnerScopedCache) return showChildren(restoringUserId)
  if (!clerkLoaded)
    return (
      <GateScreen busy>
        <Text tx="connected:gate.checkingSession" />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (!clerkSignedIn)
    return (
      <GateScreen>
        <Text accessibilityRole="alert" tx="connected:gate.signInPrompt" />
        <Button tx="connected:gate.signIn" preset="primary" onPress={onReauthenticate} />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (isAuthenticated && isUserLoaded && user?.id && user.username === null)
    return (
      <GateScreen>
        <Text preset="heading" tx="connected:gate.username.title" />
        <Text tx="connected:gate.username.description" />
        <TextField
          labelTx="connected:gate.username.label"
          accessibilityLabel={translate("connected:gate.username.label")}
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
          tx="connected:gate.username.suggest"
          onPress={() => {
            setUsername(suggestUsername())
            setUsernameError(undefined)
          }}
        />
        {usernameError ? <Text accessibilityRole="alert" text={usernameError} /> : null}
        <Button
          tx={savingUsername ? "connected:saving" : "connected:gate.username.save"}
          preset="primary"
          disabled={savingUsername || !isUsernameValid(username)}
          onPress={async () => {
            try {
              setSavingUsername(true)
              setUsernameError(undefined)
              const { acceptable } = await convex.query(api.moderation.usernameIsAcceptable, {
                username: username.trim(),
              })
              if (!acceptable) {
                setUsernameError(translate("connected:gate.username.notAllowed"))
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
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (allowPendingProfile && clerkSignedIn && isUserLoaded && user?.id && user.username !== null)
    return showChildren(user.id)
  if (
    isAuthenticated &&
    isUserLoaded &&
    user?.id &&
    connectedProfile.status === "ready" &&
    connectedProfile.profile.userId === user.id
  )
    return showChildren(user.id)
  if (connectedProfile.status === "offline")
    return (
      <GateScreen>
        <Text accessibilityRole="alert" tx="connected:gate.offline" />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (
    isLoading ||
    (connectedProfile.status === "loading" && connectedProfile.reason === "authentication")
  )
    return (
      <GateScreen busy>
        <Text tx="connected:gate.connecting" />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (
    !isAuthenticated ||
    (connectedProfile.status === "error" && connectedProfile.reason === "authentication")
  )
    return (
      <GateScreen>
        <Text accessibilityRole="alert" tx="connected:gate.authFailed" />
        <Button tx="connected:gate.signInAgain" preset="primary" onPress={onReauthenticate} />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  if (connectedProfile.status === "error" && connectedProfile.reason === "sync")
    return (
      <GateScreen>
        <Text accessibilityRole="alert" text={connectedProfile.message} />
        <Button tx="connected:gate.retrySetup" preset="primary" onPress={connectedProfile.retry} />
        <Button tx="connected:gate.signInAgain" onPress={onReauthenticate} />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  return (
    <GateScreen busy>
      <Text tx="connected:gate.preparingProfile" />
      {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
    </GateScreen>
  )
}

export function ConnectedGate({
  children,
  onBack,
  allowOfflineBootstrap,
  allowPendingProfile,
  offlineGameId,
}: {
  children: ReactNode
  onBack?: () => void
  allowPendingProfile?: boolean
  allowOfflineBootstrap?: boolean
  offlineGameId?: string
}) {
  const auth = useAuthAccess()
  if (!auth.configured)
    return (
      <GateScreen>
        <Text accessibilityRole="alert" text={auth.configurationMessage} />
        {onBack ? <Button tx="connected:gate.backToLocalPlay" onPress={onBack} /> : null}
      </GateScreen>
    )
  return (
    <ConnectedErrorBoundary onBack={onBack}>
      <ConnectedProfileProvider>
        <BackendGate
          allowPendingProfile={allowPendingProfile}
          allowOfflineBootstrap={allowOfflineBootstrap}
          offlineGameId={offlineGameId}
          clerkLoaded={auth.isLoaded}
          clerkSignedIn={auth.isSignedIn}
          hintedUserId={auth.sessionHint?.userId ?? undefined}
          onBack={onBack}
          onReauthenticate={auth.openAuth}
        >
          {children}
        </BackendGate>
      </ConnectedProfileProvider>
    </ConnectedErrorBoundary>
  )
}

const $gate: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  justifyContent: "center",
  paddingVertical: spacing.xl,
})
const $gateContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
