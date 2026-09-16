import { useMemo, useRef, useState, type ReactNode } from "react"
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

/**
 * Hands a running local game to the server so other players can join it.
 *
 * Mount this alongside `ConnectedSetupSource`, which owns the account gate and the
 * Clerk-to-Convex user sync that `publishLocalGame` needs; this component only
 * publishes, and reports failures back through the feed.
 *
 * Publish identifiers are generated once and reused on every retry. The mutation is
 * idempotent per `operationId`, but only while the payload behind it is unchanged,
 * so a fresh token on retry would create a second game instead of returning the first.
 */
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
  const identifiers = useRef<ReturnType<typeof createLobbyIdentifiers>>(undefined)
  const operationId = `publish_${game.id}`
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function publish(hostPlayerId: PlayerId) {
    if (busy) return
    try {
      setBusy(true)
      setError(undefined)
      identifiers.current ??= createLobbyIdentifiers()
      const published = await publishLocalGame(
        buildLocalGameSnapshot({
          game,
          hostPlayerId,
          operationId,
          deviceId,
          ...(await identifiers.current),
        }),
      )
      onPublished({ publicId: published.publicId, manualCode: published.manualCode })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect this game.")
    } finally {
      setBusy(false)
    }
  }

  return children({ busy, error, publish: (hostPlayerId) => void publish(hostPlayerId) })
}
