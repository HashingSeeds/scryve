import { useState } from "react"
import { router } from "expo-router"
import { useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { useHeldOrder } from "@/features/feedback/heldOrder"
import { leaveFeedback, openRequest } from "@/features/feedback/navigation"
import { useDebounced } from "@/features/feedback/useDebounced"
import { useFeedbackVote } from "@/features/feedback/useFeedbackVote"
import { FeedbackBoardScreen, type FeedbackTab } from "@/screens/FeedbackBoardScreen"

import { api } from "../../../convex/_generated/api"

const SEARCH_DELAY_MS = 250

const TAB_FILTERS = {
  all: {},
  features: { kind: "feature" },
  bugs: { kind: "bug" },
  shipped: { status: "shipped" },
} as const satisfies Record<FeedbackTab, object>

export default function FeedbackBoardRoute() {
  return useAuthAccess().configured ? <Board /> : <FeedbackUnavailable />
}

function Board() {
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const [tab, setTab] = useState<FeedbackTab>("all")
  const [search, setSearch] = useState("")
  const searched = useDebounced(search.trim(), SEARCH_DELAY_MS)
  const loaded = useQuery(
    api.feedback.board,
    key ? { key, ...TAB_FILTERS[tab], ...(searched ? { q: searched } : {}) } : "skip",
  )
  const items = useHeldOrder(loaded, `${tab}|${searched}`)
  const mine = useQuery(api.feedback.mine, key ? { key } : "skip")
  const { vote, failed } = useFeedbackVote(key)
  return (
    <FeedbackBoardScreen
      items={items}
      search={search}
      searched={searched}
      tab={tab}
      unread={mine?.filter((item) => item.unread).length ?? 0}
      offline={!online}
      voteFailed={failed}
      onSearch={setSearch}
      onTab={setTab}
      onVote={(item, voted) => vote(item._id, voted)}
      onOpen={openRequest}
      onSuggest={(title) =>
        router.push(title ? { pathname: "/feedback/new", params: { title } } : "/feedback/new")
      }
      onMine={() => router.push("/feedback/mine")}
      onBack={leaveFeedback}
    />
  )
}
