import { useState } from "react"
import { useMutation } from "convex/react"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export function useFeedbackVote(key: string | undefined) {
  const [failed, setFailed] = useState(false)
  const mutate = useMutation(api.feedback.vote).withOptimisticUpdate(
    (store, { requestId, voted }) => {
      const flip = <T extends { _id: string; voted: boolean; votes: number }>(item: T): T =>
        item._id === requestId && item.voted !== voted
          ? { ...item, voted, votes: item.votes + (voted ? 1 : -1) }
          : item
      for (const { args, value } of store.getAllQueries(api.feedback.board))
        if (value) store.setQuery(api.feedback.board, args, value.map(flip))
      for (const { args, value } of store.getAllQueries(api.feedback.published))
        if (value) store.setQuery(api.feedback.published, args, flip(value))
    },
  )
  return {
    failed,
    vote: (requestId: Id<"feedbackRequests">, voted: boolean) => {
      if (!key) return
      setFailed(false)
      mutate({ key, requestId, voted }).catch(() => setFailed(true))
    },
  }
}
