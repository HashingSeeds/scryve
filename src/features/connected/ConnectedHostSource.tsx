import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useUser } from "@clerk/expo"
import { useConvexConnectionState, useMutation, usePaginatedQuery } from "convex/react"

import { createLobbyIdentifiers } from "@/features/connected/identifiers"
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
  const { user } = useUser()
  const clerkUserId = user?.id
  const displayName = user?.fullName || user?.firstName || "Player"
  const avatarUrl = user?.imageUrl
  const { isWebSocketConnected } = useConvexConnectionState()
  const syncUser = useMutation(api.users.syncCurrent)
  const createLobby = useMutation(api.games.createLobby)
  const deviceId = useMemo(() => new LocalGameRepository().getDeviceId(), [])
  const [readyClerkUserId, setReadyClerkUserId] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const ready = Boolean(isWebSocketConnected && clerkUserId && readyClerkUserId === clerkUserId)
  const activeGames = usePaginatedQuery(api.games.activeConnectedGames, ready ? {} : "skip", {
    initialNumItems: 10,
  })
  const hasHostedGame = activeGames.results.some((game: any) => game.isHost)

  useEffect(() => {
    if (!isWebSocketConnected || !clerkUserId) return
    let cancelled = false
    void syncUser({ displayName, avatarUrl })
      .then(() => {
        if (!cancelled) setReadyClerkUserId(clerkUserId)
      })
      .catch((cause) => {
        if (cancelled) return
        setReadyClerkUserId((current) => (current === clerkUserId ? undefined : current))
        setError(cause instanceof Error ? cause.message : "Could not prepare connected play")
      })
    return () => {
      cancelled = true
    }
  }, [avatarUrl, clerkUserId, displayName, isWebSocketConnected, syncUser])

  async function host(setup: { playerCount: number; startingLife: number; ruleset: string }) {
    if (!isWebSocketConnected) {
      setError("Reconnect before hosting; lobby creation is not queued.")
      return
    }
    try {
      setBusy(true)
      setError(undefined)
      await syncUser({ displayName, avatarUrl })
      const ids = await createLobbyIdentifiers()
      const lobby = await createLobby({
        ...ids,
        ...setup,
        hostDisplayName: displayName,
        hostColor: "#7C3AED",
        deviceId,
      })
      onLobbyCreated(lobby)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create lobby")
    } finally {
      setBusy(false)
    }
  }

  return children({
    ready,
    busy,
    blockedReason: !isWebSocketConnected
      ? "Connected games need a live connection."
      : hasHostedGame
        ? "Resume or finish your hosted game before creating another."
        : undefined,
    error,
    host: (setup) => void host(setup),
  })
}
