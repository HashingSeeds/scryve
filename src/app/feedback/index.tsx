import { useState } from "react"
import { router } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import {
  FeedbackBoardScreen,
  isFeedbackStatus,
  type FeedbackFilter,
} from "@/screens/FeedbackBoardScreen"

import { api } from "../../../convex/_generated/api"

export default function FeedbackBoardRoute() {
  return useAuthAccess().configured ? <Board /> : <FeedbackUnavailable />
}

function Board() {
  const key = useFeedbackKey()
  const [filter, setFilter] = useState<FeedbackFilter>("all")
  const args = key ? { key, ...(isFeedbackStatus(filter) ? { status: filter } : {}) } : null
  const items = useQuery(api.feedback.board, args ?? "skip")
  const mine = useQuery(api.feedback.mine, key ? { key } : "skip")
  const report = useMutation(api.feedback.report)
  const vote = useMutation(api.feedback.vote).withOptimisticUpdate(
    (store, { requestId, voted }) => {
      if (!args) return
      const current = store.getQuery(api.feedback.board, args)
      if (!current) return
      store.setQuery(
        api.feedback.board,
        args,
        current.map((item) =>
          item._id === requestId && item.voted !== voted
            ? { ...item, voted, votes: item.votes + (voted ? 1 : -1) }
            : item,
        ),
      )
    },
  )
  return (
    <FeedbackBoardScreen
      items={items}
      filter={filter}
      unread={mine?.filter((item) => item.unread).length ?? 0}
      onFilter={setFilter}
      onVote={(item, voted) => {
        if (key) void vote({ key, requestId: item._id, voted }).catch(() => undefined)
      }}
      onOpen={(item) => router.push(`/feedback/${item._id}`)}
      onReport={(item) => {
        if (key) void report({ key, requestId: item._id }).catch(() => undefined)
      }}
      onSuggest={() => router.push("/feedback/new")}
      onMine={() => router.push("/feedback/mine")}
      onBack={leaveFeedback}
    />
  )
}
