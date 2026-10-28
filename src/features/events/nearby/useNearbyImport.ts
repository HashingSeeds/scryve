import { useEffect, useState } from "react"
import { useConvexAuth, useMutation } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { convexRetryAfterMs } from "@/utils/convexError"

import { nearbyImport } from "./hubEvent"
import { nearbyEventHost, useNearbyEventHost } from "./nearbyEventHost"
import { api } from "../../../../convex/_generated/api"

export function useNearbyImport() {
  const { event, importedFor } = useNearbyEventHost()
  const { userId } = useAuthAccess()
  // why: Clerk can say signed in before Convex holds the token, and an import sent then fails as unauthenticated.
  const { isAuthenticated } = useConvexAuth()
  const importNearby = useMutation(api.events.importNearby)
  const [attempt, setAttempt] = useState(0)
  const finished = event?.status === "finished" ? event : null
  useEffect(() => {
    if (!finished || !isAuthenticated || !userId || importedFor === userId) return
    let current = true
    let retry: ReturnType<typeof setTimeout> | undefined
    void createLobbyIdentifiers()
      .then(({ manualCodeCandidates }) =>
        importNearby(nearbyImport(finished, manualCodeCandidates)),
      )
      // why: during an account switch Convex can still hold the previous account's token, so the marker records the account the server actually saved for.
      .then(({ ownerId }) => current && nearbyEventHost.markImported(ownerId, finished))
      .catch((cause: unknown) => {
        const wait = convexRetryAfterMs(cause)
        if (current && wait) retry = setTimeout(() => setAttempt((count) => count + 1), wait)
      })
    return () => {
      current = false
      clearTimeout(retry)
    }
  }, [finished, importedFor, userId, isAuthenticated, importNearby, attempt])
}
