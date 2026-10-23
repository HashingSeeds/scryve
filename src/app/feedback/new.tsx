import { useEffect, useRef, useState } from "react"
import { Platform } from "react-native"
import { router, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import {
  appVersion,
  captureBugReport,
  pickScreenshot,
  type BugScreenshot,
} from "@/features/feedback/bugReport"
import { feedbackErrorMessage } from "@/features/feedback/errors"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { useFeedbackOutbox } from "@/features/feedback/outbox"
import { translate } from "@/i18n/translate"
import { FeedbackSuggestScreen, type SuggestKind } from "@/screens/FeedbackSuggestScreen"

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
  const params = useLocalSearchParams<{ message?: string; kind?: string }>()
  const online = useConvexOnline()
  const outbox = useFeedbackOutbox()
  const [kind, setKind] = useState<SuggestKind>(params.kind === "bug" ? "bug" : "feature")
  const [body, setBody] = useState(params.message ?? "")
  const [includeAccount, setIncludeAccount] = useState(false)
  const [screenshot, setScreenshot] = useState<BugScreenshot | null>(null)
  const [sentry, setSentry] = useState<{ draft: string; eventId?: string }>()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  // why: a send waits up to 8 seconds; if the player left meanwhile, navigating would replace whatever screen they're on.
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  async function send() {
    if (sending || !body.trim()) return
    setSending(true)
    setError(undefined)
    const draft = [body.trim(), screenshot?.uri ?? ""].join("\n")
    let sentryEventId = sentry?.draft === draft ? sentry.eventId : undefined
    if (kind === "bug" && sentry?.draft !== draft) {
      sentryEventId = captureBugReport({
        body: body.trim(),
        ...(screenshot ? { screenshot } : {}),
      })
      setSentry({ draft, eventId: sentryEventId })
    }
    try {
      const operationId = outbox.enqueue({
        type: "submit",
        kind,
        body: body.trim(),
        includeAccount: signedIn && includeAccount,
        appVersion: appVersion(),
        platform: Platform.OS,
        ...(sentryEventId ? { sentryEventId } : {}),
      })
      const requestId = online ? await outbox.waitFor(operationId, SEND_WAIT_MS) : undefined
      if (mounted.current) router.replace(requestId ? `/feedback/${requestId}` : "/feedback/mine")
    } catch (cause) {
      if (!mounted.current) return
      setError(feedbackErrorMessage(cause, translate("feedback:suggest.sendFailed")))
      setSending(false)
    }
  }

  return (
    <FeedbackSuggestScreen
      kind={kind}
      body={body}
      includeAccount={includeAccount}
      screenshot={screenshot}
      signedIn={signedIn}
      offline={!online}
      sending={sending}
      error={error}
      onKind={setKind}
      onBody={setBody}
      onIncludeAccount={setIncludeAccount}
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
      onBack={leaveFeedback}
    />
  )
}
