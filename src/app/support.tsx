import { Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import { router } from "expo-router"
import { useQuery } from "convex/react"
import Head from "expo-router/head"

import { openAppleStandardEula } from "@/content/legalLinks"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { translate } from "@/i18n/translate"
import { SupportScreen, type SupportScreenProps } from "@/screens/SupportScreen"
import { openUrl } from "@/utils/openUrl"

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
      {configured ? <LiveSupport /> : <StaticSupport />}
    </>
  )
}

function LiveSupport() {
  // why: opening Support shouldn't make a feedback key for someone who never sent any.
  const key = useFeedbackKey({ create: false })
  const online = useConvexOnline()
  const mine = useQuery(api.feedback.mine, key ? { key } : {})
  return <Support unread={mine?.filter((item) => item.unread).length ?? 0} offline={!online} />
}

function StaticSupport() {
  return <Support unread={0} offline={false} />
}

function Support(props: Pick<SupportScreenProps, "unread" | "offline">) {
  return (
    <SupportScreen
      {...props}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onYourFeedback={() => router.push("/feedback/mine")}
      onEmailSupport={() => void openUrl(SUPPORT_EMAIL)}
      onSuggest={(message) =>
        router.push(message ? { pathname: "/feedback/new", params: { message } } : "/feedback/new")
      }
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
