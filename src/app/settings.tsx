import { Linking, Platform } from "react-native"
import { router } from "expo-router"

import { APPLE_STANDARD_EULA_URL } from "@/content/legalLinks"
import { BlockedPlayersSection } from "@/features/connected/BlockedPlayersSection"
import { localGameRepository } from "@/features/game/localPersistence"
import { SettingsScreen } from "@/screens/SettingsScreen"
import { useAppTheme } from "@/theme/context"

export default function SettingsRoute() {
  const { setThemeContextOverride } = useAppTheme()
  return (
    <SettingsScreen
      initialSettings={localGameRepository.loadSettings()}
      onBack={() => router.back()}
      onRequestAccountDeletion={() => router.push("/delete-account")}
      onOpenPrivacy={() => router.push("/privacy")}
      onOpenTerms={() => router.push("/terms")}
      onOpenLicenseAgreement={
        Platform.OS === "ios" ? () => void Linking.openURL(APPLE_STANDARD_EULA_URL) : undefined
      }
      onOpenCookiePolicy={() => router.push("/cookie-policy")}
      BlockedPlayers={<BlockedPlayersSection />}
      onSave={(settings) => {
        localGameRepository.saveSettings(settings)
        setThemeContextOverride(
          settings.themePreference === "system" ? undefined : settings.themePreference,
        )
        router.back()
      }}
    />
  )
}
