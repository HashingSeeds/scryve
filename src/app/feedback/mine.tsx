import { useState } from "react"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
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
  const online = useConvexOnline()
  const items = useQuery(api.feedback.mine, key ? { key } : {})
  const deleteMine = useMutation(api.feedback.deleteMine)
  const [deleteFailed, setDeleteFailed] = useState(false)
  return (
    <MyFeedbackScreen
      items={items}
      offline={!online}
      deleteFailed={deleteFailed}
      onOpen={(item) => router.push(`/feedback/${item._id}`)}
      onDeleteAll={() => {
        setDeleteFailed(false)
        if (key) void deleteMine({ key }).catch(() => setDeleteFailed(true))
      }}
      onBack={leaveFeedback}
    />
  )
}
