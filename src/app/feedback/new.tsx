import { useState } from "react"
import { Platform } from "react-native"
import { router, useLocalSearchParams } from "expo-router"
import { useQuery } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import {
  appVersion,
  captureBugReport,
  pickScreenshot,
  type BugScreenshot,
} from "@/features/feedback/bugReport"
import { feedbackErrorMessage } from "@/features/feedback/errors"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback, openRequest } from "@/features/feedback/navigation"
import { useFeedbackOutbox } from "@/features/feedback/outbox"
import { useDebounced } from "@/features/feedback/useDebounced"
import { useFeedbackVote } from "@/features/feedback/useFeedbackVote"
import { translate } from "@/i18n/translate"
import {
  FeedbackSuggestScreen,
  MATCH_MIN_LENGTH,
  type SuggestKind,
} from "@/screens/FeedbackSuggestScreen"

import { api } from "../../../convex/_generated/api"

const MATCH_DELAY_MS = 300
const MATCH_COUNT = 5
// why: past this the send keeps waiting in the outbox and the player sees it under Your requests.
const SEND_WAIT_MS = 8_000

export default function NewFeedbackRoute() {
  const auth = useAuthAccess()
  return auth.configured ? (
    <Suggest signedIn={auth.isSignedIn} onSignIn={auth.openAuth} />
  ) : (
    <FeedbackUnavailable />
  )
}

function Suggest({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const params = useLocalSearchParams<{ title?: string; kind?: string }>()
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const outbox = useFeedbackOutbox()
  const { vote, failed: voteFailed } = useFeedbackVote(key)
  const [step, setStep] = useState<1 | 2>(1)
  const [kind, setKind] = useState<SuggestKind>(params.kind === "bug" ? "bug" : "feature")
  const [title, setTitle] = useState(params.title ?? "")
  const [body, setBody] = useState("")
  const [includeAccount, setIncludeAccount] = useState(false)
  const [screenshot, setScreenshot] = useState<BugScreenshot | null>(null)
  // why: Sentry keeps the report and screenshot; a retry after a refused send reuses it rather than filing it twice.
  const [sentry, setSentry] = useState<{ draft: string; eventId?: string }>()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const matchText = useDebounced(title.trim(), MATCH_DELAY_MS)
  const matches = useQuery(
    api.feedback.board,
    key && matchText.length >= MATCH_MIN_LENGTH ? { key, q: matchText } : "skip",
  )

  async function send() {
    if (sending || !body.trim()) return
    setSending(true)
    setError(undefined)
    const draft = [title.trim(), body.trim(), screenshot?.uri ?? ""].join("\n")
    let sentryEventId = sentry?.draft === draft ? sentry.eventId : undefined
    if (kind === "bug" && sentry?.draft !== draft) {
      sentryEventId = captureBugReport({
        title: title.trim(),
        body: body.trim(),
        ...(screenshot ? { screenshot } : {}),
      })
      setSentry({ draft, eventId: sentryEventId })
    }
    try {
      const operationId = outbox.enqueue({
        type: "submit",
        kind,
        title: title.trim(),
        body: body.trim(),
        includeAccount: signedIn && includeAccount,
        appVersion: appVersion(),
        platform: Platform.OS,
        ...(sentryEventId ? { sentryEventId } : {}),
      })
      const requestId = online ? await outbox.waitFor(operationId, SEND_WAIT_MS) : undefined
      router.replace(requestId ? `/feedback/${requestId}` : "/feedback/mine")
    } catch (cause) {
      setError(feedbackErrorMessage(cause, translate("feedback:suggest.sendFailed")))
      setSending(false)
    }
  }

  return (
    <FeedbackSuggestScreen
      step={step}
      kind={kind}
      title={title}
      body={body}
      includeAccount={includeAccount}
      screenshot={screenshot}
      signedIn={signedIn}
      matches={matches?.slice(0, MATCH_COUNT)}
      offline={!online}
      sending={sending}
      error={error}
      voteFailed={voteFailed}
      onKind={setKind}
      onTitle={setTitle}
      onBody={setBody}
      onIncludeAccount={setIncludeAccount}
      onContinue={() => setStep(2)}
      onEditTitle={() => setStep(1)}
      onPickScreenshot={() =>
        void pickScreenshot().then(
          (picked) => {
            if (picked) setScreenshot(picked)
          },
          () => setError(translate("feedback:suggest.screenshotFailed")),
        )
      }
      onRemoveScreenshot={() => setScreenshot(null)}
      onSignIn={onSignIn}
      onOpenPrivacy={() => router.push("/privacy")}
      onSend={() => void send()}
      onVote={(item, voted) => vote(item._id, voted)}
      onOpen={openRequest}
      onBack={() => (step === 2 ? setStep(1) : leaveFeedback())}
    />
  )
}
