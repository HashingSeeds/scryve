import { router, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedBoardScreen } from "@/screens/ConnectedBoardScreen"

export default function ConnectedGameRoute() {
  const { gameId, invite } = useLocalSearchParams<{ gameId: string; invite?: string }>()
  const auth = useAuthAccess()
  return (
    <ConnectedGate
      allowOfflineBootstrap
      offlineGameId={gameId}
      onBack={() => router.replace("/game/new?mode=connected")}
    >
      <ConnectedBoardScreen
        publicId={gameId}
        initialInviteOpen={invite === "1"}
        onGameEnded={(publicId) =>
          router.replace({
            pathname: "/history/[gameId]",
            params: { gameId: publicId, source: "connected" },
          })
        }
        onGameAbandoned={() => router.replace("/game/new?mode=connected")}
        onBack={() => router.replace("/game/new?mode=connected")}
        onHistory={() => router.push({ pathname: "/history", params: { source: "connected" } })}
        onDecks={() => router.push("/connected/decks")}
        onSettings={() => router.push("/settings")}
        accountLabel={auth.isSignedIn ? "Account" : "Sign in"}
        onAccount={() => (auth.isSignedIn ? router.push("/account") : auth.openAuth())}
      />
    </ConnectedGate>
  )
}
