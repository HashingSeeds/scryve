import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { useMutation } from "convex/react"

import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { buildLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { LocalGame, PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import type { LocalConnectFeed } from "@/screens/NewGameScreen"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import { TWO_HEADED_GIANT } from "../../../convex/lib/twoHeadedGiant"

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

  // why: a published game would lose its teams and shared life, since connected 2HG starts from the lobby.
  const blocked =
    game.variant === TWO_HEADED_GIANT ? translate("connected:publish.twoHeadedGiant") : undefined

  const publish = useCallback(
    async (hostPlayerId: PlayerId) => {
      if (inFlight.current || blocked) return
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
        setError(
          convexErrorMessage(
            cause,
            cause instanceof Error ? cause.message : translate("connected:publish.failed"),
          ),
        )
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [blocked, deviceId, game, onPublished, operationId, publishLocalGame],
  )

  const feed = useMemo<LocalConnectFeed>(
    () => ({
      busy,
      error: blocked ?? error,
      publish: (hostPlayerId) => void publish(hostPlayerId),
    }),
    [blocked, busy, error, publish],
  )

  return children(feed)
}
