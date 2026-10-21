import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConvexAuth, useConvexConnectionState } from "convex/react"

import { ErrorType, reportCrash } from "@/utils/crashReporting"

type ClerkAuth = {
  isLoaded: boolean
  isSignedIn: boolean | undefined
  getToken: (options?: { template?: "convex"; skipCache?: boolean }) => Promise<string | null>
  orgId: string | undefined | null
  orgRole: string | undefined | null
  sessionId: string | undefined | null
}

/** why: losing signal is routine; reporting it floods Sentry and stops release promotion. */
function isNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false
  const code = "code" in error ? error.code : undefined
  return (
    code === "clerk_offline" ||
    code === "network_error" ||
    /network (error|request failed)|failed to fetch/i.test(error.message)
  )
}

export function createConvexAuthHook(
  useAuthFromClerk: () => ClerkAuth,
  authenticationAttempt: number,
) {
  return function useConvexAuthFromClerk() {
    const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionId } = useAuthFromClerk()
    const currentGetToken = useRef(getToken)
    // why: Convex keeps the previous session's "not authenticated" answer until the new token is checked, so a fresh sign-in briefly reads as a rejected session. One loading render resets Convex to pending.
    const signedInSession = isSignedIn ? sessionId : undefined
    const [settledSession, setSettledSession] = useState(signedInSession)
    if (settledSession !== signedInSession) setSettledSession(signedInSession)
    const sessionStarting = Boolean(signedInSession) && settledSession !== signedInSession

    useEffect(() => {
      currentGetToken.current = getToken
    }, [getToken])

    const fetchAccessToken = useCallback(
      async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
        try {
          return forceRefreshToken
            ? await currentGetToken.current({ skipCache: true })
            : await currentGetToken.current()
        } catch (cause) {
          if (isNetworkFailure(cause)) return null
          reportCrash(
            cause instanceof Error ? cause : new Error("Clerk token request failed"),
            ErrorType.HANDLED,
          )
          return null
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [authenticationAttempt, orgId, orgRole, sessionId],
    )

    return useMemo(
      () => ({
        isLoading: !isLoaded || sessionStarting,
        isAuthenticated: isSignedIn ?? false,
        fetchAccessToken,
      }),
      [fetchAccessToken, isLoaded, isSignedIn, sessionStarting],
    )
  }
}

export function ConvexAuthReconnect({ onReconnect }: { onReconnect: () => void }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const wasConnected = useRef(isWebSocketConnected)
  const reconnectPending = useRef(false)

  useEffect(() => {
    const reconnected = !wasConnected.current && isWebSocketConnected
    wasConnected.current = isWebSocketConnected
    if (reconnected) reconnectPending.current = true
    if (!isWebSocketConnected || !reconnectPending.current || isLoading) return
    reconnectPending.current = false
    if (!isAuthenticated) onReconnect()
  }, [isAuthenticated, isLoading, isWebSocketConnected, onReconnect])

  return null
}
