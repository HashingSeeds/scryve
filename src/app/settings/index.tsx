import { supportsAlternateIcons } from "expo-alternate-app-icons"
import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
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
      onOpenAbout={() => router.push("/settings/about")}
      onOpenAppIcon={supportsAlternateIcons ? () => router.push("/settings/app-icon") : undefined}
      onOpenBlockedPlayers={
        hasCloudSession ? () => router.push("/settings/blocked-players") : undefined
      }
      onSettingsChange={(settings) => {
        localGameRepository.saveSettings(settings)
        setThemeContextOverride(
          settings.themePreference === "system" ? undefined : settings.themePreference,
        )
      }}
    />
  )
}
