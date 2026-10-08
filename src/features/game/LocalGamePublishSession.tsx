import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"

import {
  buildFinishedLocalGameSnapshot,
  buildMatchFinishSnapshot,
} from "@/features/connected/localGameSnapshot"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { convexErrorCode } from "@/utils/convexError"

import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import { api } from "../../../convex/_generated/api"

// why: the Convex client holds a mutation through disconnects, so a rejection is the server's verdict unless it is an auth hiccup.
function isPermanentRejection(cause: unknown) {
  if (cause instanceof ConvexError) return convexErrorCode(cause) !== "unauthenticated"
  return cause instanceof Error && cause.message.includes("Server Error")
}

function isDeckRejection(cause: unknown) {
  return convexErrorCode(cause)?.startsWith("deck_") === true
}

function withoutDeck(snapshot: ReturnType<typeof buildFinishedLocalGameSnapshot>) {
  return {
    ...snapshot,
    players: snapshot.players.map(({ deckVersionId: _deckVersionId, ...player }) => player),
  }
}

// why: a pass runs on account readiness, reconnect, and every finish; a transient failure ends it for the next trigger, a rejected game is marked failed so it never pins the games behind it, and the server treats a repeated game id as the same publish.
function ActivePublish({
  ownerId,
  repository,
}: {
  ownerId?: string
  repository: LocalGameRepository
}) {
  const profile = useConnectedProfile()
  const ready = profile.status === "ready" && profile.profile.userId === ownerId
  const online = useConvexOnline()
  const publish = useMutation(api.games.publishFinishedLocalGame)
  const finishMatch = useMutation(api.matches.finishScryveMatch)
  const [finishCount, setFinishCount] = useState(0)

  useEffect(
    () => repository.onGameFinished(() => setFinishCount((count) => count + 1)),
    [repository],
  )

  useEffect(() => {
    if (!ready || !online || !ownerId) return
    let cancelled = false
    void (async () => {
      for (const game of repository.pendingPublishes(ownerId)) {
        if (cancelled) return
        const snapshot = buildFinishedLocalGameSnapshot(game)
        try {
          await publish(snapshot)
          repository.markPublished(game.id)
          continue
        } catch (cause) {
          if (!isPermanentRejection(cause)) return
          // why: a deck removed since setup should not cost the game itself; it uploads once more without the deck.
          if (
            !isDeckRejection(cause) ||
            snapshot.players.every((player) => !player.deckVersionId)
          ) {
            repository.markPublishFailed(game.id)
            continue
          }
        }
        try {
          await publish(withoutDeck(snapshot))
          repository.markPublished(game.id)
        } catch (cause) {
          if (!isPermanentRejection(cause)) return
          repository.markPublishFailed(game.id)
        }
      }
      // why: a match result is only sent once its games are acked, so the server can count them.
      for (const game of repository.pendingMatchFinishes(ownerId)) {
        if (cancelled) return
        try {
          await finishMatch(buildMatchFinishSnapshot(game))
        } catch {
          return
        }
        repository.markMatchPublished(game.id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [finishCount, finishMatch, online, ownerId, publish, ready, repository])

  return null
}

export function LocalGamePublishSession({
  ownerId,
  repository = localGameRepository,
}: {
  ownerId?: string
  repository?: LocalGameRepository
}) {
  return (
    <ConnectedProfileProvider>
      <ActivePublish ownerId={ownerId} repository={repository} />
    </ConnectedProfileProvider>
  )
}
