import { useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
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
import {
  onSeatClaim,
  pendingSeatClaims,
  setNearbyOwner,
  settleSeatClaim,
} from "@/features/lan/nearbyAccount"
import { convexErrorCode, convexRetryAfterMs } from "@/utils/convexError"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import { api } from "../../../convex/_generated/api"

// why: the Convex client holds a mutation through disconnects; auth and throttling can still recover after a server rejection.
function isPermanentRejection(cause: unknown) {
  if (cause instanceof ConvexError)
    return !["unauthenticated", "rate_limited"].includes(convexErrorCode(cause) ?? "")
  return cause instanceof Error && cause.message.includes("Server Error")
}

const CLAIM_RETRY_DELAYS_MS = [5_000, 30_000, 300_000]

function isDeckRejection(cause: unknown) {
  const code = convexErrorCode(cause)
  return code?.startsWith("deck_") === true || code?.startsWith("invalid_deck_") === true
}

function withoutDeck(snapshot: ReturnType<typeof buildFinishedLocalGameSnapshot>) {
  return {
    ...snapshot,
    players: snapshot.players.map(
      ({
        deckVersionId: _deckVersionId,
        deckKey: _deckKey,
        deckFingerprint: _deckFingerprint,
        deckName: _deckName,
        ...player
      }) => player,
    ),
  }
}

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
  const claimSeat = useMutation(api.games.claimNearbySeat)
  const [finishCount, setFinishCount] = useState(0)
  const [claimCount, setClaimCount] = useState(0)
  const reported = useRef(new Set<string>())
  const claimRetries = useRef(0)
  const publishRetry = useRef<{ ownerId: string; at: number } | undefined>(undefined)

  useEffect(
    () => repository.onGameFinished(() => setFinishCount((count) => count + 1)),
    [repository],
  )

  useEffect(() => {
    if (!ready || !online || !ownerId) return
    const retryDelay =
      publishRetry.current?.ownerId === ownerId ? publishRetry.current.at - Date.now() : 0
    if (retryDelay > 0) {
      const timer = setTimeout(() => setFinishCount((count) => count + 1), retryDelay)
      return () => clearTimeout(timer)
    }
    publishRetry.current = undefined
    const report = (gameId: string, kind: "failed" | "deck_stripped", code: string) => {
      const key = `${kind}:${gameId}`
      if (reported.current.has(key)) return
      reported.current.add(key)
      const error = new Error(
        kind === "failed"
          ? "Finished game could not be published"
          : "Game published without its deck",
      )
      error.name = kind === "failed" ? "LocalGamePublishFailed" : "LocalGamePublishDeckStripped"
      reportCrash(error, ErrorType.HANDLED, {
        tags: { code },
        fingerprint: ["local-game-publish", kind],
      })
    }
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const retryThrottled = (cause: unknown) => {
      if (!cancelled && convexErrorCode(cause) === "rate_limited") {
        const delay = Math.max(1_000, convexRetryAfterMs(cause) ?? 60_000)
        publishRetry.current = { ownerId, at: Date.now() + delay }
        retryTimer = setTimeout(() => setFinishCount((count) => count + 1), delay)
      }
    }
    void (async () => {
      for (const game of repository.pendingPublishes(ownerId)) {
        if (cancelled) return
        const snapshot = buildFinishedLocalGameSnapshot(game)
        let deckRejectionCode = "unknown"
        try {
          await publish(snapshot)
          repository.markPublished(game.id)
          continue
        } catch (cause) {
          if (!isPermanentRejection(cause)) {
            retryThrottled(cause)
            return
          }
          if (!isDeckRejection(cause)) {
            repository.markPublishFailed(game.id)
            report(game.id, "failed", convexErrorCode(cause) ?? "server_error")
            continue
          }
          deckRejectionCode = convexErrorCode(cause) ?? "unknown"
        }
        try {
          await publish(withoutDeck(snapshot))
          repository.markPublished(game.id)
          report(game.id, "deck_stripped", deckRejectionCode)
        } catch (cause) {
          if (!isPermanentRejection(cause)) {
            retryThrottled(cause)
            return
          }
          repository.markPublishFailed(game.id)
          report(game.id, "failed", convexErrorCode(cause) ?? "server_error")
        }
      }
      for (const game of repository.matchFinishesWithFailedGames(ownerId))
        repository.markMatchPublishFailed(game.id)
      for (const game of repository.pendingMatchFinishes(ownerId)) {
        if (cancelled) return
        try {
          await finishMatch(buildMatchFinishSnapshot(game))
          repository.markMatchPublished(game.id)
        } catch (cause) {
          if (!isPermanentRejection(cause)) {
            retryThrottled(cause)
            return
          }
          repository.markMatchPublishFailed(game.id)
        }
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [finishCount, finishMatch, online, ownerId, publish, ready, repository])

  useEffect(() => {
    const retry = () => {
      claimRetries.current = 0
      setClaimCount((count) => count + 1)
    }
    const foreground = AppState.addEventListener("change", (state) => state === "active" && retry())
    const unsubscribe = onSeatClaim(retry)
    return () => {
      foreground.remove()
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (online) claimRetries.current = 0
  }, [online])

  useEffect(() => {
    if (!ready || !online || !ownerId) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      let waiting = false
      for (const claim of pendingSeatClaims(ownerId)) {
        if (cancelled) return
        try {
          const { status } = await claimSeat({
            publicId: claim.publicId,
            token: claim.token,
            ...(claim.deckVersionId ? { deckVersionId: claim.deckVersionId } : {}),
          })
          if (status === "claimed") settleSeatClaim(claim.publicId)
          else waiting = true
        } catch (cause) {
          if (!isPermanentRejection(cause)) return
          settleSeatClaim(claim.publicId)
        }
      }
      const delay = CLAIM_RETRY_DELAYS_MS[claimRetries.current]
      if (waiting && !cancelled && delay !== undefined) {
        claimRetries.current += 1
        retryTimer = setTimeout(() => setClaimCount((count) => count + 1), delay)
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [claimCount, claimSeat, online, ownerId, ready])

  return null
}

export function LocalGamePublishSession({
  ownerId,
  repository = localGameRepository,
}: {
  ownerId?: string
  repository?: LocalGameRepository
}) {
  useEffect(() => setNearbyOwner(ownerId), [ownerId])
  return (
    <ConnectedProfileProvider>
      <ActivePublish ownerId={ownerId} repository={repository} />
    </ConnectedProfileProvider>
  )
}
