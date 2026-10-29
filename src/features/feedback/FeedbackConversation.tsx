import { useEffect, useRef, useState } from "react"
import { Platform } from "react-native"
import { router } from "expo-router"
import * as Updates from "expo-updates"
import { useMutation, useQuery } from "convex/react"

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
import { leaveFeedback } from "@/features/feedback/navigation"
import { offerFeedbackReplies } from "@/features/notifications/prefs"
import { translate } from "@/i18n/translate"
import { FeedbackConversationScreen, type SuggestKind } from "@/screens/FeedbackConversationScreen"

import { api } from "../../../convex/_generated/api"

// why: new feedback and its thread are one screen, so the first send stays put instead of swapping screens.
export function FeedbackConversation({
  requestId: openedId,
  initialKind = "feature",
  initialMessage = "",
}: {
  requestId?: string
  initialKind?: SuggestKind
  initialMessage?: string
}) {
  const auth = useAuthAccess()
  const key = useFeedbackKey()
  const online = useConvexOnline()
  const [requestId, setRequestId] = useState(openedId)
  const thread = useQuery(api.feedback.thread, key && requestId ? { key, requestId } : "skip")
  const submit = useMutation(api.feedback.submit)
  const reply = useMutation(api.feedback.reply)
  const markRead = useMutation(api.feedback.markRead)
  const setAccount = useMutation(api.feedback.setAccount)
  const [kind, setKind] = useState(initialKind)
  const [draft, setDraft] = useState(initialMessage)
  const [includeAccount, setIncludeAccount] = useState(false)
  const [screenshot, setScreenshot] = useState<BugScreenshot | null>(null)
  const [sentScreenshotUri, setSentScreenshotUri] = useState<string>()
  const [outgoing, setOutgoing] = useState<string>()
  const [sending, setSending] = useState(false)
  const [sentry, setSentry] = useState<{ draft: string; eventId?: string }>()
  const [error, setError] = useState<string>()
  // why: if the player left while a send was out, its result has no screen to land on.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // why: a new thread's query loads only after submit resolves, so the sent message stays until it does.
  if (outgoing !== undefined && !sending && thread !== undefined) setOutgoing(undefined)

  const request = thread?.request
  const unread = request?.unread === true
  useEffect(() => {
    if (key && request && unread)
      void markRead({ key, requestId: request._id }).catch(() => undefined)
  }, [key, request, unread, markRead])

  async function startThread(body: string, attached: BugScreenshot | null) {
    if (!key) return
    const sentryDraft = [body, attached?.uri ?? ""].join("\n")
    let sentryEventId = sentry?.draft === sentryDraft ? sentry.eventId : undefined
    if ((kind === "bug" || attached) && sentry?.draft !== sentryDraft) {
      sentryEventId = captureBugReport({
        kind,
        body,
        ...(attached ? { screenshot: attached } : {}),
      })
      setSentry({ draft: sentryDraft, eventId: sentryEventId })
    }
    const created = await submit({
      key,
      kind,
      body,
      includeAccount: auth.isSignedIn && includeAccount,
      appVersion: appVersion(),
      platform: Platform.OS,
      ...(Updates.runtimeVersion ? { runtimeVersion: Updates.runtimeVersion } : {}),
      ...(sentryEventId ? { sentryEventId } : {}),
    })
    if (!mounted.current) return
    setRequestId(created)
    offerFeedbackReplies()
  }

  async function send() {
    const body = draft.trim()
    if (!body || !key || !online || sending || (requestId !== undefined && !request)) return
    const attached = screenshot
    setError(undefined)
    setSending(true)
    setOutgoing(body)
    setDraft("")
    if (!request) {
      setScreenshot(null)
      setSentScreenshotUri(attached?.uri)
    }
    try {
      if (request) await reply({ key, requestId: request._id, body })
      else await startThread(body, attached)
    } catch (cause) {
      if (!mounted.current) return
      setError(
        feedbackErrorMessage(
          cause,
          translate(request ? "feedback:thread.sendFailed" : "feedback:suggest.sendFailed"),
        ),
      )
      setOutgoing(undefined)
      setDraft((typed) => (typed.trim() ? `${body}\n\n${typed}` : body))
      if (!request) {
        setScreenshot(attached)
        setSentScreenshotUri(undefined)
      }
    } finally {
      if (mounted.current) setSending(false)
    }
  }

  return (
    <FeedbackConversationScreen
      started={requestId !== undefined}
      thread={requestId === undefined ? undefined : thread}
      kind={kind}
      draft={draft}
      outgoing={outgoing}
      screenshot={screenshot}
      sentScreenshotUri={sentScreenshotUri}
      signedIn={auth.isSignedIn}
      includeAccount={includeAccount}
      offline={!online}
      error={error}
      onKind={setKind}
      onDraft={setDraft}
      onSend={() => void send()}
      onPickScreenshot={() =>
        void pickScreenshot().then(
          (picked) => {
            if (picked) setScreenshot(picked)
          },
          () => setError(translate("feedback:suggest.screenshotFailed")),
        )
      }
      onRemoveScreenshot={() => setScreenshot(null)}
      onIncludeAccount={setIncludeAccount}
      onLinkAccount={() => {
        if (key && request)
          void setAccount({ key, requestId: request._id, included: true }).catch(() => undefined)
      }}
      onSignIn={auth.openAuth}
      onOpenPrivacy={() => router.push("/privacy")}
      onBack={leaveFeedback}
    />
  )
}
