import { useEffect, useState } from "react"

import { load, save } from "@/utils/storage"

const SESSION_HINT_KEY = "count.auth.session-hint.v1"

// why: Clerk loads network-first, so launch reads the last confirmed session synchronously instead. `userId: null` means it was signed out.
export type SessionHint = { userId: string | null }

export function readSessionHint(): SessionHint | undefined {
  const stored = load(SESSION_HINT_KEY)
  if (typeof stored !== "object" || stored === null || !("userId" in stored)) return undefined
  const { userId } = stored
  if (userId === null || (typeof userId === "string" && userId.length > 0)) return { userId }
  return undefined
}

export function writeSessionHint(hint: SessionHint): void {
  if (readSessionHint()?.userId === hint.userId) return
  save(SESSION_HINT_KEY, hint)
}

// why: callers only need the hint before Clerk loads; afterwards each confirmed session (including sign-out) overwrites it.
export function useSessionHint({
  isLoaded,
  isSignedIn,
  userId,
}: {
  isLoaded: boolean
  isSignedIn: boolean
  userId: string | undefined
}): SessionHint | undefined {
  const [launchHint] = useState(readSessionHint)
  const confirmedUserId = !isLoaded ? undefined : isSignedIn ? userId : null
  useEffect(() => {
    if (confirmedUserId !== undefined) writeSessionHint({ userId: confirmedUserId })
  }, [confirmedUserId])
  return isLoaded ? undefined : launchHint
}
