import { useEffect, useState } from "react"
import { useMutation } from "convex/react"

import { buildFinishedLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import { api } from "../../../convex/_generated/api"

// why: a pass runs on account readiness, reconnect, and every finish; the first failure ends it and the next trigger retries, which is safe because the server treats a repeated game id as the same publish.
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
        try {
          await publish(buildFinishedLocalGameSnapshot(game))
        } catch {
          return
        }
        repository.markPublished(game.id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [finishCount, online, ownerId, publish, ready, repository])

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
