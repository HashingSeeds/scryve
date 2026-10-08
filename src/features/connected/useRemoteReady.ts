import { useState } from "react"

import { toConnectedProjection } from "./model"

/**
 * why: the projection query's args carry the head pending operation, so every queued change and
 * every acknowledgement resubscribes, and Convex reports `undefined` until the server answers.
 * That reload is not the game going unavailable; treating it as such gated sync and re-rendered
 * the board twice per change. Only a delivered result (projection or null), signing out, or a
 * different game moves it.
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
