import { useMemo, useState } from "react"
import type { ViewStyle } from "react-native"
import { Redirect, router, useLocalSearchParams } from "expo-router"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { createLocalGame, PLAYER_COLORS } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { CurrentGameScreen } from "@/screens/CurrentGameScreen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const STALE_GAME_MS = 24 * 60 * 60 * 1000

function createPreparedGame(value: string | undefined) {
  if (!value) return undefined
  try {
    const input = JSON.parse(value) as unknown
    if (
      typeof input !== "object" ||
      input === null ||
      !Array.isArray((input as { players?: unknown }).players) ||
      (input as { players: unknown[] }).players.length === 0 ||
      !Number.isFinite((input as { startingLife?: unknown }).startingLife)
    )
      return undefined
    return createLocalGame(input as Parameters<typeof createLocalGame>[0])
  } catch {
    return undefined
  }
}

export default function Index() {
  const { prepared, destination } = useLocalSearchParams<{
    prepared?: string
    destination?: string
  }>()
  const auth = useAuthAccess()
  const { themed } = useAppTheme()
  const settings = localGameRepository.loadSettings()
  const [dismissedGameId, setDismissedGameId] = useState<string>()
  const [oldGameChoice, setOldGameChoice] = useState<"continue" | "end">()
  const loadedGame = localGameRepository.loadActiveGame()
  const activeGame = loadedGame?.id === dismissedGameId ? null : loadedGame
  const freshGame = useMemo(() => {
    const preparedGame = createPreparedGame(prepared)
    if (preparedGame) return preparedGame
    return createLocalGame({
      players: Array.from({ length: settings.defaultPlayerCount }, (_, index) => ({
        name: `Player ${index + 1}`,
        color: PLAYER_COLORS[index],
      })),
      startingLife: settings.defaultStartingLife,
    })
  }, [prepared, settings.defaultPlayerCount, settings.defaultStartingLife])

  const stale = activeGame ? Date.now() - activeGame.updatedAt >= STALE_GAME_MS : false

  if (destination !== "play" && (!activeGame || stale) && settings.launchDestination === "decks") {
    return <Redirect href="/connected/decks" />
  }

  if (activeGame && stale && !oldGameChoice) {
    return (
      <Screen
        preset="auto"
        safeAreaEdges={["top", "bottom"]}
        contentContainerStyle={themed($oldGame)}
      >
        <Text text="Continue game?" preset="heading" accessibilityRole="header" />
        <Text text="This game has been waiting for more than 24 hours. Nothing was discarded." />
        <Button text="Continue" preset="reversed" onPress={() => setOldGameChoice("continue")} />
        <Button text="End game" onPress={() => setOldGameChoice("end")} />
        <Button
          text="Abandon"
          onPress={() => {
            localGameRepository.clearActiveGame()
            setDismissedGameId(activeGame.id)
          }}
        />
      </Screen>
    )
  }

  return (
    <CurrentGameScreen
      initialGame={activeGame ?? freshGame}
      fresh={!activeGame}
      initialEndOpen={oldGameChoice === "end"}
      onDecks={() => router.push("/connected/decks")}
      onHistory={() => router.push("/history")}
      onSetup={() => router.push(activeGame ? "/game/new?setup=1" : "/game/new")}
      onConnect={() => router.push("/connected")}
      onSettings={() => router.push("/settings")}
      onAccount={() => (auth.isSignedIn ? router.push("/account") : auth.openAuth())}
      accountLabel={auth.isSignedIn ? "Account" : "Sign in"}
      onGameEnded={(gameId) =>
        router.replace({ pathname: "/history/[gameId]", params: { gameId } })
      }
      onGameAbandoned={() => router.replace({ pathname: "/", params: { destination: "play" } })}
    />
  )
}

const $oldGame: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 480,
  alignSelf: "center",
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
})
