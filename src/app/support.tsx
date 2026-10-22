import { Linking, Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import { router } from "expo-router"
import { useQuery } from "convex/react"
import Head from "expo-router/head"

import { openAppleStandardEula } from "@/content/legalLinks"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { translate } from "@/i18n/translate"
import { SupportScreen } from "@/screens/SupportScreen"

import { api } from "../../convex/_generated/api"

const SUPPORT_EMAIL = "mailto:support@sowinghope.how?subject=Scryve%20Support"

export default function SupportRoute() {
  const pageTitle = translate("account:support.pageTitle")
  const { configured } = useAuthAccess()
  return (
    <>
      {Platform.OS === "web" ? (
        <Head>
          <title>{pageTitle}</title>
          <meta name="description" content={translate("account:support.pageDescription")} />
        </Head>
      ) : null}
      {configured ? <SupportWithUnread /> : <Support unread={0} />}
    </>
  )
}

function SupportWithUnread() {
  // why: opening Support shouldn't make a feedback key for someone who never sent any.
  const key = useFeedbackKey({ create: false })
  const mine = useQuery(api.feedback.mine, key ? { key } : "skip")
  return <Support unread={mine?.filter((item) => item.unread).length ?? 0} />
}

function Support({ unread }: { unread: number }) {
  return (
    <SupportScreen
      unread={unread}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onSearch={(q) => router.push({ pathname: "/feedback", params: { q } })}
      onAllRequests={() => router.push("/feedback")}
      onYourRequests={() => router.push("/feedback/mine")}
      onEmailSupport={() => void Linking.openURL(SUPPORT_EMAIL)}
      onSuggest={() => router.push("/feedback/new")}
      onOpenPrivacy={() => router.push("/privacy")}
      onOpenTerms={() => router.push("/terms")}
      onOpenLicenseAgreement={
        Platform.OS === "ios" ? () => void openAppleStandardEula() : undefined
      }
      onOpenCookiePolicy={() => router.push("/cookie-policy")}
      appVersion={Application.nativeApplicationVersion ?? Constants.expoConfig?.version}
    />
  )
}
