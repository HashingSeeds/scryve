import { useCallback, useState } from "react"
import { router, useFocusEffect } from "expo-router"

import { EmptyState } from "@/components/EmptyState"
import { Screen } from "@/components/Screen"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { hasLocalGameStarted } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { rulesHref } from "@/features/rules/gameRules"
import { CurrentGameScreen } from "@/screens/CurrentGameScreen"

export default function CurrentLocalGameRoute() {
  const auth = useAuthAccess()
  const [game, setGame] = useState(() => localGameRepository.loadActiveGame())
  useFocusEffect(useCallback(() => setGame(localGameRepository.loadActiveGame()), []))
  if (!game) {
    return (
      <Screen preset="auto" safeAreaEdges={["top", "bottom"]}>
        <EmptyState
          headingTx="play:currentGame.emptyHeading"
          contentTx="play:currentGame.emptyContent"
          buttonTx="play:currentGame.openPlay"
          buttonOnPress={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
        />
      </Screen>
    )
  }
  return (
    <CurrentGameScreen
      initialGame={game}
      fresh={!hasLocalGameStarted(game)}
      onDecks={() => router.push("/connected/decks")}
      onHistory={() => router.push("/history")}
      onRules={(system, rule) => router.push(rulesHref(system, rule))}
      onSetup={() => router.push("/game/new")}
      onConnect={() => router.push("/game/new?mode=connected")}
      onSettings={() => router.push("/settings")}
      onAccount={() => router.push("/account")}
      onViewSummary={(gameId) => router.push({ pathname: "/history/[gameId]", params: { gameId } })}
      onGameAbandoned={() => router.dismissTo({ pathname: "/", params: { destination: "play" } })}
      ownerId={auth.isSignedIn ? auth.userId : undefined}
    />
  )
}
