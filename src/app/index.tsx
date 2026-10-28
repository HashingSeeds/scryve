import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, View, type ViewStyle } from "react-native"
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router"

import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useAccountEntry } from "@/features/auth/useAccountEntry"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { useNewestResumeGame } from "@/features/connected/useResumeGames"
import { createLocalGame, hasLocalGameStarted, PLAYER_COLORS } from "@/features/game/domain"
import { localGameRepository, type LocalSettings } from "@/features/game/localPersistence"
import { settingsForWhatYouPlay } from "@/features/game/whatYouPlay"
import { lanPlayAvailable, savedHostedGame } from "@/features/lan/lanAvailability"
import { rulesHref } from "@/features/rules/gameRules"
import { openStorePage, STORE_PAGE } from "@/features/updates/storeUpdate"
import { translate } from "@/i18n/translate"
import { CurrentGameScreen } from "@/screens/CurrentGameScreen"
import { WhatYouPlayScreen } from "@/screens/WhatYouPlayScreen"
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

function createFreshGame(prepared: string | undefined, settings: LocalSettings) {
  return (
    createPreparedGame(prepared) ??
    createLocalGame({
      players: Array.from({ length: settings.defaultPlayerCount }, (_, index) => ({
        name: translate("board:playerNames.default", { number: index + 1 }),
        color: PLAYER_COLORS[index],
      })),
      startingLife: settings.defaultStartingLife,
      ...(settings.defaultSystem ? { system: settings.defaultSystem } : {}),
      ...(settings.defaultFormat ? { format: settings.defaultFormat } : {}),
    })
  )
}

function resumeRedirectFor(
  localUpdatedAt: number | undefined,
  destination: string | undefined,
  prepared: string | undefined,
  newest: ResumableGame | null,
) {
  if (destination === "play" || prepared) return null
  if (!newest || newest.updatedAt <= (localUpdatedAt ?? 0)) return null
  return {
    pathname: newest.status === "lobby" ? "/connected/lobby/[gameId]" : "/connected/game/[gameId]",
    params: { gameId: newest.publicId },
  } as const
}

export default function Index() {
  const { prepared, destination } = useLocalSearchParams<{
    prepared?: string
    destination?: string
  }>()
  const auth = useAuthAccess()
  const account = useAccountEntry()
  const { themed, theme } = useAppTheme()
  const [settings, setSettings] = useState(() => localGameRepository.loadSettings())
  const [dismissedGameId, setDismissedGameId] = useState<string>()
  // why: the board stays mounted across games, so a choice about one stale game must not answer for the next.
  const [oldGameChoice, setOldGameChoice] = useState<{
    gameId: string
    choice: "continue" | "end"
  }>()
  const [loadedGame, setLoadedGame] = useState(() => localGameRepository.loadActiveGame())
  const [newerGame, setNewerGame] = useState(() => localGameRepository.hasNewerActiveGame())
  const [freshGame, setFreshGame] = useState(() => createFreshGame(prepared, settings))
  const [resumingNearbyGame] = useState(() => lanPlayAvailable() && Boolean(savedHostedGame()))
  const [checkedAt, setCheckedAt] = useState(Date.now)
  const readRevision = useRef<string>(undefined)
  const reload = useCallback(() => {
    // why: a game goes stale with time, not storage, so a day in the background must still raise the old-game prompt.
    setCheckedAt(Date.now())
    const revision = () => `${prepared}:${localGameRepository.boardRevision()}`
    // why: a reread hands the board new objects, and a fresh game gets new seat ids, so returning to an unchanged board would remount every seat.
    if (readRevision.current === revision()) return
    const nextSettings = localGameRepository.loadSettings()
    setSettings(nextSettings)
    setLoadedGame(localGameRepository.loadActiveGame())
    setNewerGame(localGameRepository.hasNewerActiveGame())
    setFreshGame(createFreshGame(prepared, nextSettings))
    // why: loadSettings can rewrite the saved settings, so the revision is taken after it.
    readRevision.current = revision()
  }, [prepared])
  useFocusEffect(reload)
  // why: the board saves without telling this route, so a reopened app rereads the saved game; otherwise the old-game prompt judges, continues, or ends the game this route loaded at launch.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") reload()
    })
    return () => subscription.remove()
  }, [reload])
  const activeGame = loadedGame?.id === dismissedGameId ? null : loadedGame
  const newestResumeGame = useNewestResumeGame()
  const resumeRedirect = resumeRedirectFor(
    activeGame?.updatedAt,
    destination,
    prepared,
    newestResumeGame ?? null,
  )
  const restoringAccount = newestResumeGame === undefined && destination !== "play" && !prepared

  const started = activeGame !== null && hasLocalGameStarted(activeGame)
  const stale = activeGame && started ? checkedAt - activeGame.updatedAt >= STALE_GAME_MS : false
  const staleChoice = oldGameChoice?.gameId === activeGame?.id ? oldGameChoice?.choice : undefined

  if (resumingNearbyGame) return <Redirect href="/lan/game" />
  if (resumeRedirect) return <Redirect href={resumeRedirect} />
  if (restoringAccount) return null

  if (settings.askWhatYouPlay && !activeGame && !prepared) {
    return (
      <WhatYouPlayScreen
        defaultPlayerCount={settings.defaultPlayerCount}
        onChoose={(type) => {
          const next = settingsForWhatYouPlay(settings, type)
          localGameRepository.saveSettings(next)
          setSettings(next)
          setFreshGame(createFreshGame(prepared, next))
        }}
      />
    )
  }

  if (destination !== "play" && (!activeGame || stale) && settings.launchDestination === "decks") {
    return <Redirect href="/connected/decks" />
  }

  if (newerGame) {
    return (
      <Screen
        preset="auto"
        safeAreaEdges={["top", "bottom"]}
        backgroundColor={theme.colors.surface}
        contentContainerStyle={themed($oldGame)}
      >
        <View style={themed($oldGameCopy)}>
          <Text tx="play:launch.updateTitle" preset="heading" accessibilityRole="header" />
          <Text tx="play:launch.updateMessage" />
        </View>
        <View style={themed($oldGameActions)}>
          {STORE_PAGE ? (
            <Button
              tx={STORE_PAGE.labelTx}
              preset="primary"
              style={themed($primaryAction)}
              onPress={openStorePage}
            />
          ) : null}
          <Button
            tx="play:launch.replaceWithNewGame"
            style={themed($secondaryAction)}
            onPress={() => {
              localGameRepository.clearActiveGame()
              setNewerGame(false)
            }}
          />
        </View>
      </Screen>
    )
  }

  if (activeGame && stale && !staleChoice) {
    return (
      <Screen
        preset="auto"
        safeAreaEdges={["top", "bottom"]}
        backgroundColor={theme.colors.surface}
        contentContainerStyle={themed($oldGame)}
      >
        <View style={themed($oldGameCopy)}>
          <Text tx="play:launch.staleTitle" preset="heading" accessibilityRole="header" />
          <Text tx="play:launch.staleMessage" />
        </View>
        <View style={themed($oldGameActions)}>
          <Button
            tx="play:launch.continue"
            preset="primary"
            style={themed($primaryAction)}
            onPress={() => setOldGameChoice({ gameId: activeGame.id, choice: "continue" })}
          />
          <Button
            tx="play:launch.endGame"
            style={themed($secondaryAction)}
            onPress={() => setOldGameChoice({ gameId: activeGame.id, choice: "end" })}
          />
          <Button
            tx="play:abandon"
            style={themed($secondaryAction)}
            onPress={() => {
              localGameRepository.clearActiveGame()
              setDismissedGameId(activeGame.id)
            }}
          />
        </View>
      </Screen>
    )
  }

  return (
    <CurrentGameScreen
      initialGame={activeGame ?? freshGame}
      fresh={!started}
      initialEndOpen={staleChoice === "end"}
      onDecks={() => router.push("/connected/decks")}
      onHistory={() => router.push("/history")}
      onRules={(system, rule) => router.push(rulesHref(system, rule))}
      onSetup={() => router.push("/game/new")}
      onConnect={() => router.push("/game/new?mode=connected")}
      onSettings={() => router.push("/settings")}
      onSupport={() => router.push("/support")}
      onAccount={account.onAccount}
      accountEntry={account.accountEntry}
      onViewSummary={(gameId) => router.push({ pathname: "/history/[gameId]", params: { gameId } })}
      onGameAbandoned={() => router.replace({ pathname: "/", params: { destination: "play" } })}
      ownerId={auth.isSignedIn ? auth.userId : undefined}
    />
  )
}

const $oldGame: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  width: "100%",
  maxWidth: 480,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
})

const $oldGameCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  justifyContent: "center",
  gap: spacing.sm,
})

const $oldGameActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $primaryAction: ThemedStyle<ViewStyle> = () => ({
  borderRadius: CHOICE_RADIUS,
})
const $secondaryAction: ThemedStyle<ViewStyle> = () => ({
  borderRadius: CHOICE_RADIUS,
  borderWidth: 2,
})
