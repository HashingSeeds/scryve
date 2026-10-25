import { Platform } from "react-native"
import { router } from "expo-router"

import { openAppleStandardEula } from "@/content/legalLinks"
import { AboutScreen } from "@/screens/AboutScreen"

export default function AboutRoute() {
  return (
    <AboutScreen
      onBack={() => router.back()}
      onOpenPrivacy={() => router.push("/privacy")}
      onOpenTerms={() => router.push("/terms")}
      onOpenLicenseAgreement={
        Platform.OS === "ios" ? () => void openAppleStandardEula() : undefined
      }
      onOpenCookiePolicy={() => router.push("/cookie-policy")}
      onOpenGameContentNotices={() => router.push("/game-content-notices")}
    />
  )
}
