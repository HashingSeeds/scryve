import { useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { FeedbackConversation } from "@/features/feedback/FeedbackConversation"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"

export default function FeedbackThreadRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  if (!useAuthAccess().configured) return <FeedbackUnavailable />
  return <FeedbackConversation requestId={id ?? ""} />
}
