import { Redirect, router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { BlockedPlayersSection } from "@/features/connected/BlockedPlayersSection"
import { SettingsPage } from "@/screens/SettingsPage"

export default function BlockedPlayersRoute() {
  const auth = useAuthAccess()
  // why: local-only builds mount no Convex provider, so the section would crash on a direct URL.
  if (!auth.configured || !auth.isSignedIn) return <Redirect href="/settings" />
  return (
    <SettingsPage titleTx="connected:blockedPlayers.title" onBack={() => router.back()}>
      <BlockedPlayersSection />
    </SettingsPage>
  )
}
