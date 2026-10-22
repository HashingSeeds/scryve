import { useState } from "react"
import { Linking, Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import { router } from "expo-router"
import { useQuery } from "convex/react"
import Head from "expo-router/head"

import { openAppleStandardEula } from "@/content/legalLinks"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { useHeldOrder } from "@/features/feedback/heldOrder"
import { openRequest } from "@/features/feedback/navigation"
import { useDebounced } from "@/features/feedback/useDebounced"
import { useFeedbackVote } from "@/features/feedback/useFeedbackVote"
import { translate } from "@/i18n/translate"
import { SupportScreen, type SupportScreenProps } from "@/screens/SupportScreen"

import { api } from "../../convex/_generated/api"

const SEARCH_DELAY_MS = 150
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
  const [search, setSearch] = useState("")
  const searched = useDebounced(search.trim(), SEARCH_DELAY_MS)
  // why: opening Support shouldn't make a feedback key for someone who never sent any; the first keystroke does, so it's ready when the search goes out.
  const key = useFeedbackKey({ create: !!search.trim() })
  const online = useConvexOnline()
  const mine = useQuery(api.feedback.mine, key ? { key } : "skip")
  const loaded = useQuery(api.feedback.board, key && searched ? { key, q: searched } : "skip")
  const [shown, setShown] = useState<{ q: string; items: NonNullable<typeof loaded> }>()
  if (!searched && shown) setShown(undefined)
  else if (searched && loaded && shown?.items !== loaded) setShown({ q: searched, items: loaded })
  const results = useHeldOrder(shown?.items, shown?.q ?? "")
  const { vote, failed } = useFeedbackVote(key)
  return (
    <Support
      unread={mine?.filter((item) => item.unread).length ?? 0}
      search={search}
      searched={searched}
      results={results}
      offline={!online}
      voteFailed={failed}
      onSearch={setSearch}
      onVote={(item, voted) => vote(item._id, voted)}
    />
  )
}

function StaticSupport() {
  const [search, setSearch] = useState("")
  return (
    <Support
      unread={0}
      search={search}
      searched={search}
      results={[]}
      offline={false}
      voteFailed={false}
      onSearch={setSearch}
      onVote={() => undefined}
    />
  )
}

function Support(
  props: Pick<
    SupportScreenProps,
    "unread" | "search" | "searched" | "results" | "offline" | "voteFailed" | "onSearch" | "onVote"
  >,
) {
  return (
    <SupportScreen
      {...props}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onOpen={openRequest}
      onAllRequests={() => router.push("/feedback")}
      onYourRequests={() => router.push("/feedback/mine")}
      onEmailSupport={() => void Linking.openURL(SUPPORT_EMAIL)}
      onSuggest={(title) =>
        router.push(title ? { pathname: "/feedback/new", params: { title } } : "/feedback/new")
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
