import { useEffect } from "react"
import { useConvexAuth } from "convex/react"

import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { useFeedbackOutbox } from "./outbox"

export function FeedbackOutboxSession() {
  const outbox = useFeedbackOutbox()
  const online = useConvexOnline()
  const { isLoading } = useConvexAuth()
  useEffect(() => outbox.start(), [outbox])
  useEffect(() => outbox.setReady(online && !isLoading), [outbox, online, isLoading])
  return null
}
