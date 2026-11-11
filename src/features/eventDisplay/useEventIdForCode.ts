import { useEffect, useState } from "react"
import { useMutation } from "convex/react"

import { LocalGameRepository } from "@/features/game/localPersistence"
import { convexErrorCode, convexErrorRetryAfterMs } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

const LOOKUP_RETRY_MS = 10_000

export function useEventIdForCode(code: string) {
  const resolveCode = useMutation(api.events.resolveCode)
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const [found, setFound] = useState<{ code: string; eventId: Id<"events"> | null }>()
  const [failure, setFailure] = useState<{ code: string; cause: unknown }>()
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const lookup = () =>
      resolveCode({ code, deviceId }).then(
        (eventId) => {
          if (!cancelled) setFound({ code, eventId })
        },
        (cause: unknown) => {
          if (cancelled) return
          if (convexErrorCode(cause) !== "rate_limited") return setFailure({ code, cause })
          timer = setTimeout(lookup, convexErrorRetryAfterMs(cause, LOOKUP_RETRY_MS))
        },
      )
    void lookup()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, deviceId, resolveCode])
  if (failure?.code === code) throw failure.cause
  return found?.code === code ? found.eventId : undefined
}
