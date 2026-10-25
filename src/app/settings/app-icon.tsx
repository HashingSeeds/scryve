import { router } from "expo-router"

import { AppIconPicker } from "@/features/appIcon/AppIconPicker"
import { SettingsPage } from "@/screens/SettingsPage"

export default function AppIconRoute() {
  return (
    <SettingsPage titleTx="account:settings.appIcon.heading" onBack={() => router.back()}>
      <AppIconPicker />
    </SettingsPage>
  )
}
