import { useState } from "react"

import { toConnectedProjection } from "./model"

/**
 * why: the projection query's args carry the head pending operation, so every queued change and ack resubscribes
 * and Convex reports `undefined` until answered. That is not the game going unavailable; treating it so gated sync
 * and re-rendered the board twice per change. Only a delivered result, signing out, or a different game moves it.
 */
export function useRemoteReady(
  publicId: string,
  isAuthenticated: boolean,
  remote: unknown,
): boolean {
  const [readyFor, setReadyFor] = useState<string | null>(null)
  const next = !isAuthenticated
    ? null
    : remote === undefined
      ? readyFor === publicId
        ? publicId
        : null
      : toConnectedProjection(remote) === null
        ? null
        : publicId
  if (next !== readyFor) setReadyFor(next)
  return next === publicId
}
