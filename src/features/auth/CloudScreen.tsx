import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Modal } from "react-native"
import { useUser } from "@clerk/expo"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { BackendGate } from "@/features/connected/ConnectedGate"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"

import { useAuthAccess } from "./AuthContext"

export interface CloudAccess {
  ready: boolean
  loading: boolean
  signedIn?: boolean
  ownerId?: string
  actionLabel?: string
  message?: string
  request: () => void
}

function CloseWhenReady({ close }: { close: () => void }) {
  useEffect(close, [close])
  return null
}

function CloudSession({
  children,
  multiplayer = false,
}: {
  children: (access: CloudAccess) => ReactNode
  multiplayer?: boolean
}) {
  const auth = useAuthAccess()
  const profile = useConnectedProfile()
  const { user, isLoaded } = useUser()
  const [usernameOpen, setUsernameOpen] = useState(false)
  const close = useCallback(() => setUsernameOpen(false), [])
  const missingUsername = multiplayer && user?.username === null
  const loading = !auth.isLoaded || !isLoaded || profile.status === "loading"
  const ready = auth.isSignedIn && profile.status === "ready" && !missingUsername
  const message = loading
    ? undefined
    : !auth.isSignedIn
      ? "Sign in to continue."
      : missingUsername
        ? "Choose your player username."
        : profile.status === "offline"
          ? "Reconnect to continue."
          : profile.status === "error"
            ? profile.message
            : undefined
  function request() {
    if (!auth.isSignedIn || (profile.status === "error" && profile.reason === "authentication"))
      auth.openAuth()
    else if (missingUsername) setUsernameOpen(true)
    else profile.retry()
  }
  return (
    <>
      {children({
        ready,
        loading,
        signedIn: auth.isSignedIn,
        ownerId: auth.isSignedIn ? user?.id : undefined,
        message,
        request,
        actionLabel: !auth.isSignedIn
          ? "Sign in"
          : missingUsername
            ? "Choose username"
            : "Try again",
      })}
      {usernameOpen ? (
        <Modal onRequestClose={close}>
          <BackendGate
            clerkLoaded={auth.isLoaded}
            clerkSignedIn={auth.isSignedIn}
            onBack={close}
            onReauthenticate={auth.openAuth}
          >
            <CloseWhenReady close={close} />
          </BackendGate>
        </Modal>
      ) : null}
    </>
  )
}

export function CloudScreen({
  children,
  onBack,
  multiplayer,
}: {
  children: (access: CloudAccess) => ReactNode
  onBack: () => void
  multiplayer?: boolean
}) {
  const auth = useAuthAccess()
  if (!auth.configured)
    return (
      <Screen preset="auto" safeAreaEdges={["bottom"]} contentInset="standard">
        <Text
          text={auth.configurationMessage ?? "Connected features are unavailable in this build."}
        />
        <Button text="Back" onPress={onBack} />
      </Screen>
    )
  return (
    <ConnectedProfileProvider>
      <CloudSession multiplayer={multiplayer}>{children}</CloudSession>
    </ConnectedProfileProvider>
  )
}
