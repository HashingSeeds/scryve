import { useEffect } from "react"
import { useMutation } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"

import { nearbyImport } from "./hubEvent"
import { nearbyEventHost, useNearbyEventHost } from "./nearbyEventHost"
import { api } from "../../../../convex/_generated/api"

// why: Convex holds a mutation until it is back online, so a store without internet saves the finished event when the connection returns.
export function useNearbyImport() {
  const { event, importedEventId } = useNearbyEventHost()
  const { isSignedIn } = useAuthAccess()
  const importNearby = useMutation(api.events.importNearby)
  const finished = event?.status === "finished" ? event : null
  useEffect(() => {
    if (!finished || importedEventId || !isSignedIn) return
    let current = true
    void createLobbyIdentifiers()
      .then(({ manualCodeCandidates }) =>
        importNearby(nearbyImport(finished, manualCodeCandidates)),
      )
      .then(({ eventId }) => current && nearbyEventHost.markImported(eventId))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [finished, importedEventId, isSignedIn, importNearby])
}
