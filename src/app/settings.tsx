import { router } from "expo-router"

import { localGameRepository } from "@/features/game/localPersistence"
import { SettingsScreen } from "@/screens/SettingsScreen"
import { useAppTheme } from "@/theme/context"

export default function SettingsRoute() {
  const { setThemeContextOverride } = useAppTheme()
  return (
    <SettingsScreen
      initialSettings={localGameRepository.loadSettings()}
      onBack={() => router.back()}
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
