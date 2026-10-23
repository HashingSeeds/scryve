import { useEffect, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { feedbackErrorMessage } from "@/features/feedback/errors"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { translate } from "@/i18n/translate"
import { FeedbackThreadScreen } from "@/screens/FeedbackThreadScreen"

import { api } from "../../../convex/_generated/api"

export default function FeedbackThreadRoute() {
  const auth = useAuthAccess()
  const { id } = useLocalSearchParams<{ id?: string }>()
  if (!auth.configured) return <FeedbackUnavailable />
  return <Thread requestId={id ?? ""} onSignIn={auth.openAuth} />
}

function Thread({ requestId, onSignIn }: { requestId: string; onSignIn: () => void }) {
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const thread = useQuery(api.feedback.thread, key ? { key, requestId } : "skip")
  const markRead = useMutation(api.feedback.markRead)
  const setAccount = useMutation(api.feedback.setAccount)
  const reply = useMutation(api.feedback.reply)
  const [error, setError] = useState<string>()
  const [restore, setRestore] = useState<{ id: number; text: string }>()
  const request = thread?.request
  const unread = request?.unread === true
  useEffect(() => {
    if (key && request && unread)
      void markRead({ key, requestId: request._id }).catch(() => undefined)
  }, [key, request, unread, markRead])
  return (
    <FeedbackThreadScreen
      thread={thread}
      offline={!online}
      error={error}
      restore={restore}
      onReply={(body) => {
        if (!key || !request) return
        setError(undefined)
        reply({ key, requestId: request._id, body }).catch((cause: unknown) => {
          setError(feedbackErrorMessage(cause, translate("feedback:thread.sendFailed")))
          setRestore((last) => ({ id: (last?.id ?? 0) + 1, text: body }))
        })
      }}
      onIncludeAccount={(included) => {
        if (key && request)
          void setAccount({ key, requestId: request._id, included }).catch(() => undefined)
      }}
      onSignIn={onSignIn}
      onBack={leaveFeedback}
    />
  )
}
