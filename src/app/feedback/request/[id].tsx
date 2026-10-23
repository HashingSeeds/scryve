import { useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import type { FeedbackBoardItem } from "@/features/feedback/status"
import { useFeedbackVote } from "@/features/feedback/useFeedbackVote"
import { FeedbackRequestScreen } from "@/screens/FeedbackRequestScreen"

import { api } from "../../../../convex/_generated/api"

export default function FeedbackRequestRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  return useAuthAccess().configured ? <Request requestId={id ?? ""} /> : <FeedbackUnavailable />
}

function Request({ requestId }: { requestId: string }) {
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const loaded = useQuery(api.feedback.published, key ? { key, requestId } : "skip")
  const report = useMutation(api.feedback.report)
  const { vote, failed } = useFeedbackVote(key)
  const [reported, setReported] = useState<FeedbackBoardItem>()
  const [reportFailed, setReportFailed] = useState(false)
  // why: a report takes the request off the board, so the query turns null; the player still sees what they reported.
  const item = reported ?? loaded
  return (
    <FeedbackRequestScreen
      item={item}
      offline={!online}
      voteFailed={failed}
      reportFailed={reportFailed}
      onVote={(voted) => {
        if (item) vote(item._id, voted)
      }}
      onReport={() => {
        if (!key || !item) return
        setReportFailed(false)
        setReported({ ...item, reported: true })
        report({ key, requestId: item._id }).catch(() => {
          setReported(undefined)
          setReportFailed(true)
        })
      }}
      onBack={leaveFeedback}
    />
  )
}
