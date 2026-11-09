import { useEffect } from "react"

import type { ConnectedLogFeed } from "@/features/connected/ConnectedLogDialog"

import { lanSession, useLanSessionSlice } from "./lanSession"

export const NearbyLogFeed: ConnectedLogFeed = ({ publicId, children }) => {
  const log = useLanSessionSlice((state) => state.log)
  const sequence = useLanSessionSlice((state) => state.projection?.eventSequence)
  useEffect(() => lanSession.requestLog(), [sequence])
  return children({ events: log?.publicId === publicId ? log.events : [] })
}
