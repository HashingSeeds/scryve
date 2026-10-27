import { supportsAlternateIcons } from "expo-alternate-app-icons"
import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { localGameRepository } from "@/features/game/localPersistence"
import { pushSupported } from "@/features/notifications/device"
import { setPushPref, usePushPref } from "@/features/notifications/prefs"
import { SettingsScreen } from "@/screens/SettingsScreen"
import { useAppTheme } from "@/theme/context"

export default function SettingsRoute() {
  const { setThemeContextOverride } = useAppTheme()
  const auth = useAuthAccess()
  const hasCloudSession = auth.configured && auth.isSignedIn
  const billing = useRevenueCat()
  const feedbackReplies = usePushPref("feedbackReplies")
  const renewalReminders = usePushPref("renewalReminders")
  return (
    <SettingsScreen
      initialSettings={localGameRepository.loadSettings()}
      onBack={() => router.back()}
      onOpenAbout={() => router.push("/settings/about")}
      onOpenAppIcon={supportsAlternateIcons ? () => router.push("/settings/app-icon") : undefined}
      onOpenBlockedPlayers={
        hasCloudSession ? () => router.push("/settings/blocked-players") : undefined
      }
      notifications={
        pushSupported && auth.configured
          ? {
              feedbackReplies,
              renewalReminders:
                hasCloudSession && billing.isCountPro ? renewalReminders : undefined,
              onChange: (kind, on) => void setPushPref(kind, on),
            }
          : undefined
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
