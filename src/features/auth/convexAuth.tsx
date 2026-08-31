import { useCallback, useEffect, useMemo, useRef } from "react"
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

export function createConvexAuthHook(
  useAuthFromClerk: () => ClerkAuth,
  authenticationAttempt: number,
) {
  return function useConvexAuthFromClerk() {
    const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionId } = useAuthFromClerk()
    const currentGetToken = useRef(getToken)

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
        isLoading: !isLoaded,
        isAuthenticated: isSignedIn ?? false,
        fetchAccessToken,
      }),
      [fetchAccessToken, isLoaded, isSignedIn],
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
