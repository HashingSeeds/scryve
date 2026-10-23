import { useState } from "react"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { useFeedbackOutbox, useFeedbackSends } from "@/features/feedback/outbox"
import { MyFeedbackScreen } from "@/screens/MyFeedbackScreen"

import { api } from "../../../convex/_generated/api"

export default function MyFeedbackRoute() {
  return useAuthAccess().configured ? <MyFeedback /> : <FeedbackUnavailable />
}

function MyFeedback() {
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const outbox = useFeedbackOutbox()
  const { pending, failures } = useFeedbackSends()
  const items = useQuery(api.feedback.mine, key ? { key } : "skip")
  const deleteMine = useMutation(api.feedback.deleteMine)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const unsent = [
    ...pending.flatMap((send) =>
      send.type === "submit" ? [{ operationId: send.operationId, body: send.body }] : [],
    ),
    ...failures.flatMap(({ action, reason }) =>
      action.type === "submit"
        ? [{ operationId: action.operationId, body: action.body, reason }]
        : [],
    ),
  ]
  return (
    <MyFeedbackScreen
      items={items}
      unsent={unsent}
      offline={!online}
      deleteFailed={deleteFailed}
      onOpen={(item) => router.push(`/feedback/${item._id}`)}
      onDiscard={(operationId) => outbox.discard(operationId)}
      onDeleteAll={() => {
        // why: a send still waiting would otherwise go out after the player deleted their feedback.
        outbox.clear()
        setDeleteFailed(false)
        if (key) void deleteMine({ key }).catch(() => setDeleteFailed(true))
      }}
      onBack={leaveFeedback}
    />
  )
}
