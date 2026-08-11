import { router } from "expo-router"

import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedHomeScreen } from "@/screens/ConnectedHomeScreen"

export default function ConnectedIndex() {
  return (
    <ConnectedGate onBack={() => router.replace("/")}>
      <ConnectedHomeScreen
        onBack={() => router.replace("/")}
        onLobbyCreated={(lobby) =>
          router.replace({
            pathname: "/connected/lobby/[gameId]",
            params: { gameId: lobby.publicId },
          })
        }
        onJoin={() => router.push("/connected/join")}
        onHistory={() => router.push("/connected/history")}
        onDecks={() => router.push("/connected/decks")}
        onResume={(game) =>
          router.replace({
            pathname:
              game.status === "lobby" ? "/connected/lobby/[gameId]" : "/connected/game/[gameId]",
            params: { gameId: game.publicId },
          })
        }
      />
    </ConnectedGate>
  )
}
