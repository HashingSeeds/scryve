import { useCallback, useEffect, useMemo, useRef } from "react"
import { useConvexAuth, useConvexConnectionState } from "convex/react"

type ClerkAuth = {
  isLoaded: boolean
  isSignedIn: boolean | undefined
  getToken: (options?: { template?: "convex"; skipCache?: boolean }) => Promise<string | null>
  orgId: string | undefined | null
  orgRole: string | undefined | null
  sessionId: string | undefined | null
  sessionClaims: unknown
}

export function createConvexAuthHook(
  useAuthFromClerk: () => ClerkAuth,
  authenticationAttempt: number,
) {
  return function useConvexAuthFromClerk() {
    const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionId, sessionClaims } =
      useAuthFromClerk()
    const currentClerkSession = useRef({ getToken, sessionClaims })

    useEffect(() => {
      currentClerkSession.current = { getToken, sessionClaims }
    }, [getToken, sessionClaims])

    const fetchAccessToken = useCallback(
      async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
        try {
          const { getToken: getCurrentToken, sessionClaims: currentSessionClaims } =
            currentClerkSession.current
          const usesNativeIntegration =
            typeof currentSessionClaims === "object" &&
            currentSessionClaims !== null &&
            "aud" in currentSessionClaims &&
            currentSessionClaims.aud === "convex"
          if (usesNativeIntegration) {
            return forceRefreshToken
              ? await getCurrentToken({ skipCache: true })
              : await getCurrentToken()
          }
          return await getCurrentToken({ template: "convex", skipCache: forceRefreshToken })
        } catch {
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

  useEffect(() => {
    const reconnected = !wasConnected.current && isWebSocketConnected
    wasConnected.current = isWebSocketConnected
    if (reconnected && !isLoading && !isAuthenticated) onReconnect()
  }, [isAuthenticated, isLoading, isWebSocketConnected, onReconnect])

  return null
}
