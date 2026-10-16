import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Modal } from "react-native"
import { useUser } from "@clerk/expo"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { BackendGate } from "@/features/connected/ConnectedGate"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import { translate } from "@/i18n/translate"

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
      ? translate("account:cloud.signInToContinue")
      : missingUsername
        ? translate("account:cloud.chooseUsername")
        : profile.status === "offline"
          ? translate("account:cloud.reconnect")
          : profile.status === "error"
            ? profile.message
            : undefined
  function request() {
    if (!auth.isSignedIn || (profile.status === "error" && profile.reason === "authentication"))
      auth.openAuth()
    else if (missingUsername) setUsernameOpen(true)
    else profile.retry()
  }
  const actionLabel = !auth.isSignedIn
    ? translate("account:signIn")
    : missingUsername
      ? translate("account:cloud.chooseUsernameAction")
      : translate("common:tryAgain")
  return (
    <>
      {children({
        ready,
        loading,
        signedIn: auth.isSignedIn,
        ownerId: auth.isSignedIn ? user?.id : undefined,
        message,
        request,
        actionLabel,
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
  if (!auth.configured) {
    const content = auth.configurationMessage ?? translate("account:cloud.localPlayAvailable")
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]} contentInset="standard">
        <EmptyState
          imageSource={null}
          headingTx="account:cloud.unavailableHeading"
          content={content}
          buttonTx="common:back"
          buttonOnPress={onBack}
        />
      </Screen>
    )
  }
  return (
    <ConnectedProfileProvider>
      <CloudSession multiplayer={multiplayer}>{children}</CloudSession>
    </ConnectedProfileProvider>
  )
}
