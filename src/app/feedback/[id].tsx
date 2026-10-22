import { useEffect, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { feedbackErrorMessage } from "@/features/feedback/errors"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { useFeedbackOutbox, useFeedbackSends } from "@/features/feedback/outbox"
import { translate } from "@/i18n/translate"
import { FeedbackThreadScreen } from "@/screens/FeedbackThreadScreen"

import { api } from "../../../convex/_generated/api"

const SEND_WAIT_MS = 8_000

export default function FeedbackThreadRoute() {
  const auth = useAuthAccess()
  const { id } = useLocalSearchParams<{ id?: string }>()
  if (!auth.configured) return <FeedbackUnavailable />
  return <Thread requestId={id ?? ""} onSignIn={auth.openAuth} />
}

function Thread({ requestId, onSignIn }: { requestId: string; onSignIn: () => void }) {
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const outbox = useFeedbackOutbox()
  const { pending, failures } = useFeedbackSends()
  const thread = useQuery(api.feedback.threadById, key ? { key, requestId } : "skip")
  const markRead = useMutation(api.feedback.markRead)
  const setAccount = useMutation(api.feedback.setAccount)
  const [error, setError] = useState<string>()
  const [restore, setRestore] = useState<{ id: number; text: string }>()
  const request = thread?.request
  const unread = request?.unread === true
  useEffect(() => {
    if (key && request && unread)
      void markRead({ key, requestId: request._id }).catch(() => undefined)
  }, [key, request, unread, markRead])
  const unsent = [
    ...pending.flatMap((send) =>
      send.type === "reply" && send.requestId === requestId
        ? [{ operationId: send.operationId, body: send.body }]
        : [],
    ),
    ...failures.flatMap(({ action, reason }) =>
      action.type === "reply" && action.requestId === requestId
        ? [{ operationId: action.operationId, body: action.body, reason }]
        : [],
    ),
  ]
  return (
    <FeedbackThreadScreen
      thread={thread}
      unsent={unsent}
      offline={!online}
      error={error}
      restore={restore}
      onReply={(body) => {
        if (!request) return
        setError(undefined)
        const operationId = outbox.enqueue({ type: "reply", requestId: request._id, body })
        if (!online) return
        outbox.waitFor(operationId, SEND_WAIT_MS).catch((cause: unknown) => {
          setError(feedbackErrorMessage(cause, translate("feedback:thread.sendFailed")))
          setRestore((last) => ({ id: (last?.id ?? 0) + 1, text: body }))
        })
      }}
      onDiscard={(operationId) => outbox.discard(operationId)}
      onIncludeAccount={(included) => {
        if (key && request)
          void setAccount({ key, requestId: request._id, included }).catch(() => undefined)
      }}
      onSignIn={onSignIn}
      onBack={leaveFeedback}
    />
  )
}
