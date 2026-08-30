import { Linking, Platform } from "react-native"
import { router } from "expo-router"

import { APPLE_STANDARD_EULA_URL } from "@/content/legalLinks"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { BlockedPlayersSection } from "@/features/connected/BlockedPlayersSection"
import { localGameRepository } from "@/features/game/localPersistence"
import { SettingsScreen } from "@/screens/SettingsScreen"
import { useAppTheme } from "@/theme/context"

export default function SettingsRoute() {
  const { setThemeContextOverride } = useAppTheme()
  const auth = useAuthAccess()
  const hasCloudSession = auth.configured && auth.isSignedIn
  return (
    <SettingsScreen
      initialSettings={localGameRepository.loadSettings()}
      onBack={() => router.back()}
      onRequestAccountDeletion={() => router.push("/delete-account")}
      onOpenSupport={() => router.push("/support")}
      onOpenPrivacy={() => router.push("/privacy")}
      onOpenTerms={() => router.push("/terms")}
      onOpenLicenseAgreement={
        Platform.OS === "ios" ? () => void Linking.openURL(APPLE_STANDARD_EULA_URL) : undefined
      }
      onOpenCookiePolicy={() => router.push("/cookie-policy")}
      onOpenGameContentNotices={() => router.push("/game-content-notices")}
      BlockedPlayers={hasCloudSession ? <BlockedPlayersSection /> : undefined}
      onSettingsChange={(settings) => {
        localGameRepository.saveSettings(settings)
        setThemeContextOverride(
          settings.themePreference === "system" ? undefined : settings.themePreference,
        )
      }}
    />
  )
}
