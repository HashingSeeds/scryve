import { useEffect } from "react"
import { useConvexAuth } from "convex/react"

import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { useFeedbackOutbox } from "./outbox"

export function FeedbackOutboxSession({ accountId }: { accountId: string | undefined }) {
  const outbox = useFeedbackOutbox()
  const online = useConvexOnline()
  const { isLoading } = useConvexAuth()
  useEffect(() => outbox.start(), [outbox])
  useEffect(
    () => outbox.setReady(online && !isLoading, accountId),
    [outbox, online, isLoading, accountId],
  )
  return null
}
