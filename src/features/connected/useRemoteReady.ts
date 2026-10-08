import { useRef } from "react"

import { toConnectedProjection } from "./model"

/**
 * why: the projection query's args carry the head pending operation, so every queued change and
 * every acknowledgement resubscribes, and Convex reports `undefined` until the server answers.
 * That reload is not the game going unavailable; treating it as such gated sync and re-rendered
 * the board twice per change. Only a delivered result (projection or null) or signing out moves it.
 */
export function useRemoteReady(
  publicId: string,
  isAuthenticated: boolean,
  remote: unknown,
): boolean {
  const readyFor = useRef<string | null>(null)
  if (!isAuthenticated) readyFor.current = null
  else if (remote !== undefined)
    readyFor.current = toConnectedProjection(remote) === null ? null : publicId
  return readyFor.current === publicId
}
