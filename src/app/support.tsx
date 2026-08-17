import { Linking } from "react-native"
import { router } from "expo-router"

import { SupportScreen } from "@/screens/SupportScreen"

export default function SupportRoute() {
  return (
    <SupportScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onEmailSupport={() => void Linking.openURL("mailto:support@sow.care?subject=Count%20Support")}
      onOpenPrivacy={() => router.push("/privacy")}
      onOpenTerms={() => router.push("/terms")}
      onOpenEula={() => router.push("/eula")}
      onOpenCookiePolicy={() => router.push("/cookie-policy")}
    />
  )
}
