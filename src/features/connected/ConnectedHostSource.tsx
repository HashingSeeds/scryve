import { useMemo, useState, type ReactNode } from "react"
import { useMutation, usePaginatedQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remotePage } from "@/features/async/remoteState"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import {
  useConnectedProfile,
  type ConnectedProfileState,
} from "@/features/connected/useConnectedProfile"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { ConnectedHostFeed } from "@/screens/NewGameScreen"

import { api } from "../../../convex/_generated/api"

export interface CreatedLobby {
  publicId: string
  inviteToken: string
  manualCode: string
}

export function ConnectedHostSource({
  onLobbyCreated,
  children,
}: {
  onLobbyCreated: (lobby: CreatedLobby) => void
  children: (feed: ConnectedHostFeed) => ReactNode
}) {
  const connectedProfile = useConnectedProfile()
  return (
    <ConvexQueryBoundary
      resetKey={connectedProfile.profile?.userId}
      fallback={({ retry }) =>
        children({
          ready: false,
          busy: false,
          error: "Could not check for an existing hosted game.",
          retry,
          host: () => undefined,
        })
      }
    >
      <ConnectedHostQuerySource connectedProfile={connectedProfile} onLobbyCreated={onLobbyCreated}>
        {children}
      </ConnectedHostQuerySource>
    </ConvexQueryBoundary>
  )
}

function ConnectedHostQuerySource({
  connectedProfile,
  onLobbyCreated,
  children,
}: {
  connectedProfile: ConnectedProfileState
  onLobbyCreated: (lobby: CreatedLobby) => void
  children: (feed: ConnectedHostFeed) => ReactNode
}) {
  const createLobby = useMutation(api.games.createLobby)
  const deviceId = useMemo(() => new LocalGameRepository().getDeviceId(), [])
  const [hostError, setHostError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const ready = connectedProfile.status === "ready"
  const activeGames = usePaginatedQuery(api.games.activeConnectedGames, ready ? {} : "skip", {
    initialNumItems: 10,
  })
  const activeGamesState = ready ? remotePage(activeGames, 10) : { status: "loading" as const }
  const hasHostedGame =
    activeGamesState.status === "ready" && activeGamesState.items.some((game) => game.isHost)
  const preparationStatus =
    connectedProfile.status === "loading"
      ? "Preparing your connected profile…"
      : ready && activeGamesState.status === "loading"
        ? "Checking for an existing hosted game…"
        : undefined
  const hostReady = ready && activeGamesState.status === "ready"

  async function host(setup: { playerCount: number; startingLife: number; ruleset: string }) {
    if (connectedProfile.status === "offline") {
      setHostError("Reconnect before hosting; lobby creation is not queued.")
      return
    }
    if (connectedProfile.status !== "ready" || !hostReady) {
      setHostError(
        connectedProfile.status === "error"
          ? connectedProfile.message
          : (preparationStatus ?? "Connected profile is not ready yet."),
      )
      return
    }
    try {
      setBusy(true)
      setHostError(undefined)
      const ids = await createLobbyIdentifiers()
      const lobby = await createLobby({
        ...ids,
        ...setup,
        hostDisplayName: connectedProfile.profile.displayName,
        hostColor: "#7C3AED",
        deviceId,
      })
      onLobbyCreated(lobby)
    } catch (cause) {
      setHostError(cause instanceof Error ? cause.message : "Could not create lobby")
    } finally {
      setBusy(false)
    }
  }

  return children({
    ready: hostReady,
    busy,
    status: preparationStatus,
    blockedReason:
      connectedProfile.status === "offline"
        ? "Connected games need a live connection."
        : hasHostedGame
          ? "Resume or finish your hosted game before creating another."
          : undefined,
    error:
      hostError ?? (connectedProfile.status === "error" ? connectedProfile.message : undefined),
    host: (setup) => void host(setup),
  })
}
