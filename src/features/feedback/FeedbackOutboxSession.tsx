import { useEffect } from "react"
import { useConvexAuth } from "convex/react"

import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { useFeedbackOutbox } from "./outbox"

export function FeedbackOutboxSession({ accountId }: { accountId: string | undefined }) {
  const outbox = useFeedbackOutbox()
  const online = useConvexOnline()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const authSettled = !isLoading && (!accountId || isAuthenticated)
  useEffect(() => outbox.start(), [outbox])
  useEffect(
    () => outbox.setReady(online && authSettled, accountId),
    [outbox, online, authSettled, accountId],
  )
  return null
}
