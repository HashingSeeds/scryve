import { memo, useCallback, useEffect, useState } from "react"
import { Modal } from "react-native"
import { useUser } from "@clerk/expo"

import { useAuthAccess } from "@/features/auth/AuthContext"
import type { ConnectedHostFeed } from "@/screens/NewGameScreen"

import { BackendGate } from "./ConnectedGate"
import { ConnectedHostSource, type CreatedLobby } from "./ConnectedHostSource"
import { ConnectedProfileProvider } from "./useConnectedProfile"

function ReportFeed({
  feed,
  onChange,
}: {
  feed: ConnectedHostFeed
  onChange: (feed: ConnectedHostFeed) => void
}) {
  useEffect(() => onChange(feed), [feed, onChange])
  return null
}

function ProfileReady({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady])
  return null
}

function SetupFeed({
  onChange,
  onLobbyCreated,
}: {
  onChange: (feed: ConnectedHostFeed) => void
  onLobbyCreated: (lobby: CreatedLobby) => void
}) {
  const auth = useAuthAccess()
  const { isLoaded, user } = useUser()
  const [choosingUsername, setChoosingUsername] = useState(false)
  const closeUsername = useCallback(() => setChoosingUsername(false), [])
  const checkingSession = !auth.isLoaded || !isLoaded
  const access =
    !checkingSession && !auth.isSignedIn
      ? { label: "Sign in to host", request: auth.openAuth }
      : !checkingSession && user?.username === null
        ? { label: "Choose username", request: () => setChoosingUsername(true) }
        : undefined

  return (
    <>
      <ConnectedHostSource onLobbyCreated={onLobbyCreated}>
        {(feed) => (
          <ReportFeed
            onChange={onChange}
            feed={{
              ...feed,
              ready: feed.ready && !checkingSession && !access,
              access,
              status: checkingSession
                ? "Connecting… You can keep editing."
                : access
                  ? undefined
                  : feed.status,
              error: checkingSession || access ? undefined : feed.error,
              blockedReason: checkingSession || access ? undefined : feed.blockedReason,
              activeGames: checkingSession || access ? undefined : feed.activeGames,
            }}
          />
        )}
      </ConnectedHostSource>
      {choosingUsername ? (
        <Modal onRequestClose={closeUsername}>
          <BackendGate
            clerkLoaded={auth.isLoaded}
            clerkSignedIn={auth.isSignedIn}
            onBack={closeUsername}
            onReauthenticate={auth.openAuth}
          >
            <ProfileReady onReady={closeUsername} />
          </BackendGate>
        </Modal>
      ) : null}
    </>
  )
}

export const ConnectedSetupSource = memo(function ConnectedSetupSource({
  onChange,
  onLobbyCreated,
}: {
  onChange: (feed: ConnectedHostFeed) => void
  onLobbyCreated: (lobby: CreatedLobby) => void
}) {
  const auth = useAuthAccess()
  if (!auth.configured)
    return (
      <ReportFeed
        onChange={onChange}
        feed={{
          ready: false,
          busy: false,
          blockedReason: auth.configurationMessage ?? "Connected play is unavailable.",
          host: () => undefined,
          exitGame: async () => false,
        }}
      />
    )
  return (
    <ConnectedProfileProvider>
      <SetupFeed onChange={onChange} onLobbyCreated={onLobbyCreated} />
    </ConnectedProfileProvider>
  )
})
