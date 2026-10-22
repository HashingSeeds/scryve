import { Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import { router } from "expo-router"
import { useMutation } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { loadFeedbackKey } from "@/features/feedback/feedbackKey"
import { FeedbackUnavailable } from "@/features/feedback/FeedbackUnavailable"
import { leaveFeedback } from "@/features/feedback/navigation"
import { FeedbackFormScreen } from "@/screens/FeedbackFormScreen"

import { api } from "../../../convex/_generated/api"

export default function NewFeedbackRoute() {
  const auth = useAuthAccess()
  return auth.configured ? (
    <NewFeedback signedIn={auth.isSignedIn} onSignIn={auth.openAuth} />
  ) : (
    <FeedbackUnavailable />
  )
}

function NewFeedback({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const submit = useMutation(api.feedback.submit)
  return (
    <FeedbackFormScreen
      signedIn={signedIn}
      onSignIn={onSignIn}
      onSubmit={async (draft) => {
        const requestId = await submit({
          ...draft,
          key: await loadFeedbackKey(),
          appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version,
          platform: Platform.OS,
        })
        router.replace(`/feedback/${requestId}`)
      }}
      onBack={leaveFeedback}
    />
  )
}
