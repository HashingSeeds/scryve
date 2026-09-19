import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { useMutation } from "convex/react"

import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { buildLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { LocalGame, PlayerId } from "@/features/game/types"
import type { LocalConnectFeed } from "@/screens/NewGameScreen"

import { api } from "../../../convex/_generated/api"

export interface PublishedGame {
  publicId: string
  manualCode: string
}

export function LocalGamePublishSource({
  game,
  onPublished,
  children,
}: {
  game: LocalGame
  onPublished: (published: PublishedGame) => void
  children: (feed: LocalConnectFeed) => ReactNode
}) {
  const publishLocalGame = useMutation(api.games.publishLocalGame)
  const repository = useMemo(() => new LocalGameRepository(), [])
  const deviceId = useMemo(() => repository.getDeviceId(), [repository])
  const identifiers = useRef<Awaited<ReturnType<typeof createLobbyIdentifiers>>>(undefined)
  const inFlight = useRef(false)
  const operationId = `publish_${game.id}`
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const publish = useCallback(
    async (hostPlayerId: PlayerId) => {
      if (inFlight.current) return
      try {
        inFlight.current = true
        setBusy(true)
        setError(undefined)
        identifiers.current ??= await createLobbyIdentifiers()
        const published = await publishLocalGame(
          buildLocalGameSnapshot({
            game,
            hostPlayerId,
            operationId,
            deviceId,
            ...identifiers.current,
          }),
        )
        onPublished({ publicId: published.publicId, manualCode: published.manualCode })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not connect this game.")
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [deviceId, game, onPublished, operationId, publishLocalGame],
  )

  const feed = useMemo<LocalConnectFeed>(
    () => ({ busy, error, publish: (hostPlayerId) => void publish(hostPlayerId) }),
    [busy, error, publish],
  )

  return children(feed)
}
