import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { MyFeedbackScreen } from "@/screens/MyFeedbackScreen"

import { api } from "../../../convex/_generated/api"

export default function MyFeedbackRoute() {
  return useAuthAccess().configured ? <MyFeedback /> : <FeedbackUnavailable />
}

function MyFeedback() {
  const key = useFeedbackKey()
  const items = useQuery(api.feedback.mine, key ? { key } : "skip")
  const deleteMine = useMutation(api.feedback.deleteMine)
  return (
    <MyFeedbackScreen
      items={items}
      onOpen={(item) => router.push(`/feedback/${item._id}`)}
      onDeleteAll={() => {
        if (key) void deleteMine({ key }).catch(() => undefined)
      }}
      onBack={leaveFeedback}
    />
  )
}
