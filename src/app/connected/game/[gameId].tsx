import { useCallback, useState } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { GameSavedToast } from "@/features/game/GameSavedToast"
import { ConnectedBoardScreen } from "@/screens/ConnectedBoardScreen"

export default function ConnectedGameRoute() {
  const { gameId, invite, savedGameId } = useLocalSearchParams<{
    gameId: string
    invite?: string
    savedGameId?: string
  }>()
  const auth = useAuthAccess()
  const [dismissedSavedGameId, setDismissedSavedGameId] = useState<string>()
  const dismissSavedToast = useCallback(() => setDismissedSavedGameId(savedGameId), [savedGameId])
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
        onRematch={(rematchPublicId) =>
          router.replace({
            pathname: "/connected/game/[gameId]",
            params: { gameId: rematchPublicId, savedGameId: gameId },
          })
        }
        onGameAbandoned={() => router.replace("/game/new?mode=connected")}
        onSetup={() => router.push("/game/new?mode=connected")}
        onBack={() => router.replace("/game/new?mode=connected")}
        onHistory={() => router.push({ pathname: "/history", params: { source: "connected" } })}
        onDecks={() => router.push("/connected/decks")}
        onSettings={() => router.push("/settings")}
        accountLabel={auth.isSignedIn ? "Account" : "Sign in"}
        onAccount={() => (auth.isSignedIn ? router.push("/account") : auth.openAuth())}
      />
      {savedGameId && savedGameId !== dismissedSavedGameId ? (
        <GameSavedToast
          onViewSummary={() =>
            router.push({
              pathname: "/history/[gameId]",
              params: { gameId: savedGameId, source: "connected" },
            })
          }
          onDismiss={dismissSavedToast}
        />
      ) : null}
    </ConnectedGate>
  )
}
