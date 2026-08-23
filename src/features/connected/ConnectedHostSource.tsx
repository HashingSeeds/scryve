import { useMemo, useState, type ReactNode } from "react"
import { useMutation, usePaginatedQuery } from "convex/react"

import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { useConnectedProfile } from "@/features/connected/useConnectedProfile"
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
  const createLobby = useMutation(api.games.createLobby)
  const deviceId = useMemo(() => new LocalGameRepository().getDeviceId(), [])
  const [hostError, setHostError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const ready = connectedProfile.status === "ready"
  const activeGames = usePaginatedQuery(api.games.activeConnectedGames, ready ? {} : "skip", {
    initialNumItems: 10,
  })
  const hasHostedGame = activeGames.results.some((game) => game.isHost)

  async function host(setup: { playerCount: number; startingLife: number; ruleset: string }) {
    if (connectedProfile.status === "offline") {
      setHostError("Reconnect before hosting; lobby creation is not queued.")
      return
    }
    if (connectedProfile.status !== "ready") {
      setHostError(
        connectedProfile.status === "error"
          ? connectedProfile.message
          : "Connected profile is not ready yet.",
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
    ready,
    busy,
    blockedReason:
      connectedProfile.status === "offline"
        ? "Connected games need a live connection."
        : hasHostedGame
          ? "Resume or finish your hosted game before creating another."
          : undefined,
    error:
      hostError ??
      (connectedProfile.status === "error" && connectedProfile.reason === "sync"
        ? connectedProfile.message
        : undefined),
    host: (setup) => void host(setup),
  })
}
