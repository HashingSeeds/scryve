import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, usePaginatedQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remotePage } from "@/features/async/remoteState"
import { useAuthAccess } from "@/features/auth/AuthContext"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { connectedDeploymentScope, ConnectedGameRepository } from "@/features/connected/persistence"
import {
  useConnectedProfile,
  type ConnectedProfileState,
} from "@/features/connected/useConnectedProfile"
import { useResumeGames } from "@/features/connected/useResumeGames"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { NO_PLAY_SYSTEM } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import type { ConnectedHostFeed } from "@/screens/NewGameScreen"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorMessage } from "@/utils/convexError"

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
          error: translate("connected:host.checkFailed"),
          retry,
          host: () => undefined,
          exitGame: async () => false,
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
  const auth = useAuthAccess()
  const createLobby = useMutation(api.games.createLobby)
  const localRepository = useMemo(() => new LocalGameRepository(), [])
  const deviceId = useMemo(() => localRepository.getDeviceId(), [localRepository])
  const connectedUserId = connectedProfile.profile?.userId
  const resumeRepository = useMemo(
    () =>
      new ConnectedGameRepository(
        undefined,
        connectedUserId ?? "anonymous",
        {},
        connectedDeploymentScope(),
      ),
    [connectedUserId],
  )
  const migrationRepository = useMemo(
    () => (connectedUserId ? resumeRepository : null),
    [resumeRepository, connectedUserId],
  )
  const migrateMemberships = useMutation(api.games.migrateMyGameMemberships)
  const leaveGame = useMutation(api.games.leaveMyGame)
  const abandonGame = useMutation(api.games.abandonGame)
  const [hostError, setHostError] = useState<string>()
  const [exitError, setExitError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const ready = connectedProfile.status === "ready"
  const activeGames = usePaginatedQuery(api.games.activeConnectedGames, ready ? {} : "skip", {
    initialNumItems: 10,
  })
  const activeGamesState = useMemo(
    () => (ready ? remotePage(activeGames, 10) : { status: "loading" as const }),
    [ready, activeGames],
  )
  const hasHostedGame =
    activeGamesState.status === "ready" && activeGamesState.items.some((game) => game.isHost)
  const preparationStatus =
    connectedProfile.status === "loading"
      ? translate("connected:setup.connecting")
      : ready && activeGamesState.status === "loading"
        ? translate("connected:host.checkingGames")
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

  useEffect(() => {
    if (!connectedUserId || activeGamesState.status !== "ready") return
    resumeRepository.syncResumeIndex(
      activeGamesState.items as readonly ResumableGame[],
      activeGamesState.nextPage.status === "exhausted",
    )
  }, [connectedUserId, resumeRepository, activeGamesState])
  const cachedResumeGames = useResumeGames(resumeRepository)

  async function host(setup: Parameters<ConnectedHostFeed["host"]>[0]) {
    captureAnalytics("connection_attempt", { action: "create", stage: "started" })
    if (connectedProfile.status === "offline") {
      captureAnalytics("connection_attempt", {
        action: "create",
        stage: "failed",
        reason: "offline",
      })
      setHostError(translate("connected:host.reconnectToHost"))
      return
    }
    if (connectedProfile.status !== "ready" || !hostReady) {
      captureAnalytics("connection_attempt", {
        action: "create",
        stage: "failed",
        reason: "profile",
      })
      setHostError(
        connectedProfile.status === "error"
          ? connectedProfile.message
          : (preparationStatus ?? translate("connected:host.profileNotReady")),
      )
      return
    }
    let requestSucceeded = false
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
      requestSucceeded = true
      captureAnalytics("connection_attempt", { action: "create", stage: "succeeded" })
      localRepository.saveLayoutPreference(setup.playerCount, layout)
      onLobbyCreated(lobby)
    } catch (cause) {
      if (!requestSucceeded)
        captureAnalytics("connection_attempt", {
          action: "create",
          stage: "failed",
          reason: "request",
        })
      setHostError(
        convexErrorMessage(
          cause,
          cause instanceof Error ? cause.message : translate("connected:host.createFailed"),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  async function exitGame(game: ResumableGame) {
    if (busy) return false
    if (connectedProfile.status === "offline") {
      setExitError(translate("connected:host.reconnectToExit"))
      return false
    }
    if (!hostReady) {
      setExitError(preparationStatus ?? translate("connected:host.profileNotReady"))
      return false
    }
    try {
      setBusy(true)
      setExitError(undefined)
      if (game.isHost) await abandonGame({ publicId: game.publicId })
      else await leaveGame({ publicId: game.publicId, deviceId })
      resumeRepository.removeResumeEntry(game.publicId)
      return true
    } catch (cause) {
      setExitError(cause instanceof Error ? cause.message : translate("connected:host.exitFailed"))
      return false
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
        ? translate("connected:host.offline")
        : hasHostedGame
          ? translate("connected:host.alreadyHosting")
          : undefined,
    error:
      hostError ?? (connectedProfile.status === "error" ? connectedProfile.message : undefined),
    exitError,
    retry:
      connectedProfile.status === "error" && connectedProfile.reason !== "sync"
        ? auth.openAuth
        : connectedProfile.retry,
    ...(activeGamesState.status === "ready"
      ? {
          activeGames: activeGamesState.items as readonly ResumableGame[],
          activeGamesNextPage: activeGamesState.nextPage,
        }
      : cachedResumeGames.length
        ? { activeGames: cachedResumeGames }
        : {}),
    host: (setup) => void host(setup),
    exitGame,
  })
}
