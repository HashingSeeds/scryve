import { router, useLocalSearchParams } from "expo-router"

import { localGameRepository } from "@/features/game/localPersistence"
import { GameHistoryDetailScreen } from "@/screens/GameHistoryDetailScreen"

export default function LocalHistoryDetailRoute() {
  const { gameId } = useLocalSearchParams<{ gameId?: string }>()
  return (
    <GameHistoryDetailScreen
      detail={typeof gameId === "string" ? localGameRepository.loadHistoryDetail(gameId) : null}
      onBack={() => router.back()}
    />
  )
}
