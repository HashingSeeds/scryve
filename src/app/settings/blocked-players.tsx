import { router } from "expo-router"

import { BlockedPlayersSection } from "@/features/connected/BlockedPlayersSection"
import { SettingsPage } from "@/screens/SettingsPage"

export default function BlockedPlayersRoute() {
  return (
    <SettingsPage titleTx="connected:blockedPlayers.title" onBack={() => router.back()}>
      <BlockedPlayersSection />
    </SettingsPage>
  )
}
