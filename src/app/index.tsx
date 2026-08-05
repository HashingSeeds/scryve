import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { localGameRepository } from "@/features/game/localPersistence"
import { HomeScreen } from "@/screens/HomeScreen"

export default function Index() {
  const auth = useAuthAccess()
  const hasActiveGame = localGameRepository.loadActiveGame() !== null
  return (
    <HomeScreen
      hasActiveGame={hasActiveGame}
      onNewGame={() => router.push("/game/new")}
      onResumeGame={() => router.push("/game/current")}
      onHistory={() => router.push("/history")}
      onSettings={() => router.push("/settings")}
      onConnected={() => router.push("/connected")}
      onAccount={auth.isSignedIn ? () => router.push("/account") : auth.openAuth}
      isSignedIn={auth.isSignedIn}
    />
  )
}
