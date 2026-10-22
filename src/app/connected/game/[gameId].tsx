import { useCallback, useState } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { useAccountEntry } from "@/features/auth/useAccountEntry"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { GameSavedToast } from "@/features/game/GameSavedToast"
import { rulesHref } from "@/features/rules/gameRules"
import { ConnectedBoardScreen } from "@/screens/ConnectedBoardScreen"

export default function ConnectedGameRoute() {
  const { gameId, invite, savedGameId } = useLocalSearchParams<{
    gameId: string
    invite?: string
    savedGameId?: string
  }>()
  const account = useAccountEntry()
  const [dismissedSavedGameId, setDismissedSavedGameId] = useState<string>()
  const dismissSavedToast = useCallback(() => setDismissedSavedGameId(savedGameId), [savedGameId])
  return (
    <ConnectedGate
      allowOfflineBootstrap
      offlineGameId={gameId}
      onBack={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
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
        onLeave={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
        onBack={() => router.replace("/game/new?mode=connected")}
        onHistory={() => router.push({ pathname: "/history", params: { source: "connected" } })}
        onRules={(system, rule) => router.push(rulesHref(system, rule))}
        onDecks={() => router.push("/connected/decks")}
        onSettings={() => router.push("/settings")}
        accountEntry={account.accountEntry}
        onAccount={account.onAccount}
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
