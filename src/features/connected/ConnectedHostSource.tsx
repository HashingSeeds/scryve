import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, usePaginatedQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remotePage } from "@/features/async/remoteState"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { ConnectedGameRepository } from "@/features/connected/persistence"
import {
  useConnectedProfile,
  type ConnectedProfileState,
} from "@/features/connected/useConnectedProfile"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { NO_PLAY_SYSTEM } from "@/features/game/playSystems"
import type { ConnectedHostFeed } from "@/screens/NewGameScreen"

import { api } from "../../../convex/_generated/api"
import { PLAYER_COLOR_CHOICES } from "../../../convex/lib/appearance"

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
  const localRepository = useMemo(() => new LocalGameRepository(), [])
  const deviceId = useMemo(() => localRepository.getDeviceId(), [localRepository])
  const migrationRepository = useMemo(
    () =>
      connectedProfile.profile
        ? new ConnectedGameRepository(undefined, connectedProfile.profile.userId)
        : null,
    [connectedProfile.profile],
  )
  const migrateMemberships = useMutation(api.games.migrateMyGameMemberships)
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

  useEffect(() => {
    if (!ready || !migrationRepository || migrationRepository.isMembershipMigrationComplete())
      return
    let cancelled = false
    void (async () => {
      let cursor: string | null = null
      let isDone = false
      while (!isDone && !cancelled) {
        const result: { continueCursor: string; isDone: boolean } = await migrateMemberships({
          cursor,
        })
        cursor = result.continueCursor
        isDone = result.isDone
      }
      if (!cancelled) migrationRepository.markMembershipMigrationComplete()
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [migrateMemberships, migrationRepository, ready])

  async function host(setup: Parameters<ConnectedHostFeed["host"]>[0]) {
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
      const { layout, system, ...lobbySetup } = setup
      const lobby = await createLobby({
        ...ids,
        ...lobbySetup,
        system: system ?? NO_PLAY_SYSTEM,
        hostDisplayName: connectedProfile.profile.displayName,
        hostColor: PLAYER_COLOR_CHOICES[0],
        deviceId,
      })
      localRepository.saveLayoutPreference(setup.playerCount, layout)
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
    ...(activeGamesState.status === "ready"
      ? {
          activeGames: activeGamesState.items as readonly ResumableGame[],
          activeGamesNextPage: activeGamesState.nextPage,
        }
      : {}),
    host: (setup) => void host(setup),
  })
}
