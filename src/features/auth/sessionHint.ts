import { useEffect, useState } from "react"

import { load, save } from "@/utils/storage"

import { readPublicCloudConfig } from "./config"

const SESSION_HINT_KEY = "count.auth.session-hint.v1"

// why: Clerk loads network-first, so launch reads the last confirmed session synchronously instead. `userId: null` means it was signed out.
export type SessionHint = { userId: string | null }

// why: a hint from another Clerk instance or Convex deployment (dev vs production builds) must never stand in for this one.
function currentScope(): string | undefined {
  const config = readPublicCloudConfig()
  return config.configured
    ? `${config.value.clerkPublishableKey}|${config.value.convexUrl}`
    : undefined
}

export function readSessionHint(): SessionHint | undefined {
  const scope = currentScope()
  const stored = load(SESSION_HINT_KEY)
  if (!scope || typeof stored !== "object" || stored === null) return undefined
  if (!("scope" in stored) || stored.scope !== scope || !("userId" in stored)) return undefined
  const { userId } = stored
  if (userId === null || (typeof userId === "string" && userId.length > 0)) return { userId }
  return undefined
}

export function writeSessionHint(hint: SessionHint): void {
  const scope = currentScope()
  if (!scope || readSessionHint()?.userId === hint.userId) return
  save(SESSION_HINT_KEY, { ...hint, scope })
}

// why: only the launch before Clerk's first load may use the hint; Clerk also reports "not loaded" mid sign-out, when the old account must not come back.
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
  const [hasLoaded, setHasLoaded] = useState(isLoaded)
  const confirmedUserId = !isLoaded ? undefined : isSignedIn ? userId : null
  useEffect(() => {
    if (isLoaded) setHasLoaded(true)
  }, [isLoaded])
  useEffect(() => {
    if (confirmedUserId !== undefined) writeSessionHint({ userId: confirmedUserId })
  }, [confirmedUserId])
  return isLoaded || hasLoaded ? undefined : launchHint
}
