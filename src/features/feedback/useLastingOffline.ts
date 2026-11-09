import { useEffect, useState } from "react"

import { OFFLINE_AFTER_MS } from "@/features/connected/boardSyncSignal"

export function useLastingOffline(online: boolean) {
  const [lasting, setLasting] = useState(false)
  if (online && lasting) setLasting(false)
  useEffect(() => {
    if (online) return
    const timer = setTimeout(() => setLasting(true), OFFLINE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [online])
  return lasting
}
