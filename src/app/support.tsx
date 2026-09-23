import { Linking, Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import { router } from "expo-router"
import * as Sentry from "@sentry/react-native"
import Head from "expo-router/head"

import { APPLE_STANDARD_EULA_URL } from "@/content/legalLinks"
import { SupportScreen, type SupportFeedback } from "@/screens/SupportScreen"

function submitFeedback({ kind, message, email }: SupportFeedback) {
  if (!Sentry.getClient()) throw new Error("Sentry is unavailable")
  Sentry.captureFeedback(
    {
      message,
      email,
      tags: {
        kind,
        platform: Platform.OS,
        appVersion:
          Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "unknown",
        build: Application.nativeBuildVersion ?? "unknown",
      },
    },
    { includeReplay: false },
  )
}

export default function SupportRoute() {
  return (
    <>
      {Platform.OS === "web" ? (
        <Head>
          <title>Scryve Help</title>
          <meta
            name="description"
            content="Learn how to get started with Scryve, find answers to common questions, or contact support."
          />
        </Head>
      ) : null}
      <SupportScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        onEmailSupport={() =>
          void Linking.openURL("mailto:support@sowinghope.how?subject=Scryve%20Support")
        }
        onSubmitFeedback={submitFeedback}
        onOpenPrivacy={() => router.push("/privacy")}
        onOpenTerms={() => router.push("/terms")}
        onOpenLicenseAgreement={
          Platform.OS === "ios" ? () => void Linking.openURL(APPLE_STANDARD_EULA_URL) : undefined
        }
        onOpenCookiePolicy={() => router.push("/cookie-policy")}
        appVersion={Constants.expoConfig?.version}
      />
    </>
  )
}
