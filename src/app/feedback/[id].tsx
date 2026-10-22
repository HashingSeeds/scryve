import { useEffect } from "react"
import { useLocalSearchParams } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { FeedbackThreadScreen } from "@/screens/FeedbackThreadScreen"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export default function FeedbackThreadRoute() {
  const auth = useAuthAccess()
  const { id } = useLocalSearchParams<{ id?: string }>()
  if (!auth.configured || !id) return <FeedbackUnavailable />
  // why: the id comes from a link; Convex rejects one that isn't a feedbackRequests id.
  return <Thread requestId={id as Id<"feedbackRequests">} onSignIn={auth.openAuth} />
}

function Thread({
  requestId,
  onSignIn,
}: {
  requestId: Id<"feedbackRequests">
  onSignIn: () => void
}) {
  const key = useFeedbackKey()
  const thread = useQuery(api.feedback.thread, key ? { key, requestId } : "skip")
  const reply = useMutation(api.feedback.reply)
  const markRead = useMutation(api.feedback.markRead)
  const setAccount = useMutation(api.feedback.setAccount)
  const unread = thread?.request.unread === true
  useEffect(() => {
    if (key && unread) void markRead({ key, requestId }).catch(() => undefined)
  }, [key, unread, markRead, requestId])
  return (
    <FeedbackThreadScreen
      thread={thread}
      onReply={async (body) => {
        if (key) await reply({ key, requestId, body })
      }}
      onIncludeAccount={(included) => {
        if (key) void setAccount({ key, requestId, included }).catch(() => undefined)
      }}
      onSignIn={onSignIn}
      onBack={leaveFeedback}
    />
  )
}
