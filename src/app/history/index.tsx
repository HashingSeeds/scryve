import { router } from "expo-router"

import { localGameRepository } from "@/features/game/localPersistence"
import { GameHistoryScreen } from "@/screens/GameHistoryScreen"

export default function LocalHistoryRoute() {
  return (
    <GameHistoryScreen
      games={localGameRepository.loadHistory()}
      onBack={() => router.back()}
      onSelect={(gameId) => router.push({ pathname: "/history/[gameId]", params: { gameId } })}
      onConnectedHistory={() => router.push("/connected/history")}
    />
  )
}
