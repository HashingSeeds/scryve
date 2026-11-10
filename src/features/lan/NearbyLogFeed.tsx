import { useEffect } from "react"

import type { ConnectedLogFeed } from "@/features/connected/ConnectedLogDialog"

import { lanSession, useLanSessionSlice } from "./lanSession"

export const NearbyLogFeed: ConnectedLogFeed = ({ publicId, children }) => {
  const log = useLanSessionSlice((state) => state.log)
  const sequence = useLanSessionSlice((state) => state.projection?.eventSequence)
  // why: a log opened offline asks again on reconnect, even when no change landed meanwhile.
  const status = useLanSessionSlice((state) => state.status)
  useEffect(() => lanSession.requestLog(), [sequence, status])
  const shown = log?.publicId === publicId ? log : undefined
  const oldest = shown?.events[0]?.operationId
  return children({
    events: shown?.events ?? [],
    more: shown?.more && oldest ? () => lanSession.requestLog(oldest) : undefined,
  })
}
