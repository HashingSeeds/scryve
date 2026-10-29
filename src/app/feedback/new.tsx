import { useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { FeedbackConversation } from "@/features/feedback/FeedbackConversation"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"

export default function NewFeedbackRoute() {
  const { message, kind } = useLocalSearchParams<{ message?: string; kind?: string }>()
  if (!useAuthAccess().configured) return <FeedbackUnavailable />
  return (
    <FeedbackConversation
      initialKind={kind === "bug" ? "bug" : "feature"}
      {...(message ? { initialMessage: message } : {})}
    />
  )
}
