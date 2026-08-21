import { Linking, Platform } from "react-native"
import Constants from "expo-constants"
import { router } from "expo-router"
import Head from "expo-router/head"

import { APPLE_STANDARD_EULA_URL } from "@/content/legalLinks"
import { SupportScreen } from "@/screens/SupportScreen"

export default function SupportRoute() {
  return (
    <>
      <Head>
        <title>Scryve Help</title>
        <meta
          name="description"
          content="Learn how to get started with Scryve, find answers to common questions, or contact support."
        />
      </Head>
      <SupportScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        onEmailSupport={() =>
          void Linking.openURL("mailto:support@sow.care?subject=Scryve%20Support")
        }
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
