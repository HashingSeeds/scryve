import { router, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedBoardScreen } from "@/screens/ConnectedBoardScreen"

export default function ConnectedGameRoute() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>()
  const auth = useAuthAccess()
  return (
    <ConnectedGate
      allowOfflineBootstrap
      offlineGameId={gameId}
      onBack={() => router.replace("/connected")}
    >
      <ConnectedBoardScreen
        publicId={gameId}
        onBack={() => router.replace("/connected")}
        onHistory={() => router.push({ pathname: "/history", params: { source: "connected" } })}
        onDecks={() => router.push("/connected/decks")}
        onSettings={() => router.push("/settings")}
        accountLabel={auth.isSignedIn ? "Account" : "Sign in"}
        onAccount={() => (auth.isSignedIn ? router.push("/account") : auth.openAuth())}
      />
    </ConnectedGate>
  )
}
