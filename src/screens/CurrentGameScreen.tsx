import { useCallback, useMemo, useRef, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import {
  $dialogActions,
  $dialogButton,
  $dialogText,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import { type RadialMenuAction } from "@/components/GameRadialMenu"
import { getPlayerGridLayoutOptions, PlayerGrid } from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import {
  canContinueMatch,
  drawsLabel,
  hasLocalGameStarted,
  incomingCommanderDamage,
  isEliminatedByCommanderDamage,
  matchContextLabel,
  matchScoreAfter,
} from "@/features/game/domain"
import { GameBoardStage } from "@/features/game/GameBoardStage"
import { GameSavedToast } from "@/features/game/GameSavedToast"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import { LocalMatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import { supportsCommanderDamage } from "@/features/game/playSystems"
import type {
  GamePlayer,
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  PlayerId,
} from "@/features/game/types"
import { useLocalGame } from "@/features/game/useLocalGame"
import { useMenuButtonStyle } from "@/features/game/useMenuButtonStyle"
import { useSeatColors } from "@/features/game/useSeatColors"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { GameEndSource } from "@/utils/analytics"

export interface CurrentGameScreenProps {
  initialGame: LocalGame
  fresh?: boolean
  initialEndOpen?: boolean
  onDecks?: () => void
  onHistory?: () => void
  onSetup?: () => void
  onConnect?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountLabel?: "Account" | "Sign in"
  onViewSummary: (gameId: string) => void
  onGameAbandoned?: () => void
  repository?: LocalGameRepository
  /** why: the signed-in account that a finished game uploads to. */
  ownerId?: string
}

export function CurrentGameScreen({
  initialGame,
  fresh = false,
  initialEndOpen = false,
  onDecks,
  onHistory,
  onSetup,
  onConnect,
  onSettings,
  onAccount,
  accountLabel = "Account",
  onViewSummary,
  onGameAbandoned,
  repository,
  ownerId,
}: CurrentGameScreenProps) {
  useKeepAwake("count-local-game", { suppressDeactivateWarnings: true })
  const menuButtonStyle = useMenuButtonStyle()
  const { themed } = useAppTheme()
  const insets = useSafeAreaInsets()
  const runtime = useLocalGame(initialGame, repository, ownerId)
  const system = runtime.game.system
  const [menuOpen, setMenuOpen] = useState(false)
  const [freshBoard, setFreshBoard] = useState(fresh)
  const [saved, setSaved] = useState<{ gameId: string; message: string }>()
  // why: the game that just ended decides whether the match goes on, and it is already in history.
  const [matchPrompt, setMatchPrompt] = useState<LocalGame | undefined>(() =>
    runtime.pendingMatchEnd(),
  )
  const [matchEnding, setMatchEnding] = useState<LocalGame>()
  const [matchOpen, setMatchOpen] = useState(false)
  const isFresh = freshBoard && !hasLocalGameStarted(runtime.game)
  const match = runtime.game.match
  const [endSource, setEndSource] = useState<GameEndSource | undefined>(
    initialEndOpen ? "stale_game_prompt" : undefined,
  )
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const [armedPlayerId, setArmedPlayerId] = useState<PlayerId | null>(null)
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null)
  const commanderDamageEnabled = supportsCommanderDamage(system, runtime.game.format)

  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime

  function toggleSword(player: GamePlayer) {
    setInspectedPlayerId(null)
    setArmedPlayerId((current) => (current === player.id ? null : player.id))
  }

  function assignCommanderDamage(target: GamePlayer, step: number) {
    if (!armedPlayerId || armedPlayerId === target.id) return
    runtime.assignCommanderDamage(armedPlayerId, target.id, step)
  }

  const captureMenuDialogOrigin = useCallback((event?: GestureResponderEvent) => {
    setMenuDialogOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
  }, [])
  const playerCount = runtime.game.players.length
  const layoutVariant = runtime.game.layout ?? "auto"
  const layoutOptions = getPlayerGridLayoutOptions(playerCount)

  function confirmEnd(result: LocalGameResult) {
    const ended = runtime.finish(result, endSource)
    if (ended.status === "active") {
      setEndSource(undefined)
      return
    }
    // why: a failed rematch save throws here, and the open dialog shows the error.
    if (ended.match && !ended.match.result) {
      // why: at the game cap the board waits for the match result, so Cancel or a restart cannot orphan the match.
      if (canContinueMatch(ended)) runtime.nextMatchGame()
      else runtime.holdMatchEnd(ended.match.id)
      setEndSource(undefined)
      setFreshBoard(true)
      setMatchPrompt(ended)
      return
    }
    runtime.rematch()
    setEndSource(undefined)
    setFreshBoard(true)
    setSaved({ gameId: ended.id, message: ended.match ? "Match saved" : "Game saved" })
  }

  function confirmEndMatch(outcomes: MatchSeatOutcome[]) {
    if (!matchEnding?.match) return
    const ended = runtime.endMatch(matchEnding.match.id, outcomes)
    setMatchEnding(undefined)
    setFreshBoard(true)
    setSaved({ gameId: ended.id, message: "Match saved" })
  }

  function cancelEndMatch() {
    const ending = matchEnding
    setMatchEnding(undefined)
    if (ending && ending.status !== "active" && !canContinueMatch(ending)) setMatchPrompt(ending)
  }

  function openEndMatch() {
    if (!match) return
    const latest = runtime.latestMatchGame(match.id)
    setMatchOpen(false)
    if (latest) setMatchEnding(latest)
  }

  const dismissSavedToast = useCallback(() => setSaved(undefined), [])

  // why: a judge-ordered restart mid-match replays the same game number; the match and its score stay.
  function abandonGame() {
    setEndSource(undefined)
    if (match) {
      runtime.restartMatchGame()
      setFreshBoard(true)
      return
    }
    if (!onGameAbandoned) return
    runtime.discard()
    setTimeout(onGameAbandoned, 0)
  }

  const openMatchScore = useCallback(() => {
    setMenuOpen(false)
    setMatchOpen(true)
  }, [])

  const showEndConfirmation = useCallback(() => {
    setMenuOpen(false)
    setEndSource("game_menu")
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current)
  }, [])

  const undoAndCloseMenu = useCallback(() => {
    runtimeRef.current.undo()
    setMenuOpen(false)
  }, [])

  const exitCommanderMode = useCallback(() => {
    setArmedPlayerId(null)
    setInspectedPlayerId(null)
  }, [])

  function closePanel() {
    setLayoutPickerOpen(false)
  }

  const radialActions: readonly RadialMenuAction[] = useMemo(
    () => [
      {
        kind: "layout",
        label: "Layout",
        disabled: layoutOptions.length < 2,
        onPress: (event) => {
          captureMenuDialogOrigin(event)
          setMenuOpen(false)
          setLayoutPickerOpen(true)
        },
      },
      {
        kind: "undo",
        label: "Undo",
        disabled: !runtime.canUndo,
        onPress: undoAndCloseMenu,
      },
      {
        kind: "setup",
        label: "Game",
        disabled: !onSetup,
        onPress: () => {
          closeMenu()
          onSetup?.()
        },
      },
      {
        kind: "history",
        label: "History",
        disabled: !onHistory,
        onPress: () => {
          closeMenu()
          onHistory?.()
        },
      },
      isFresh
        ? {
            kind: "connect",
            label: "Connect",
            disabled: !onConnect,
            onPress: () => {
              closeMenu()
              onConnect?.()
            },
          }
        : {
            kind: "end-game",
            label: "End",
            onPress: (event) => {
              captureMenuDialogOrigin(event)
              showEndConfirmation()
            },
          },
    ],
    [
      captureMenuDialogOrigin,
      closeMenu,
      isFresh,
      layoutOptions.length,
      onConnect,
      onHistory,
      onSetup,
      runtime.canUndo,
      showEndConfirmation,
      undoAndCloseMenu,
    ],
  )

  const seatColors = useSeatColors(runtime.game.players)
  const exitAction = useMemo(
    () =>
      armedPlayerId || inspectedPlayerId
        ? { label: "Exit commander damage", onPress: exitCommanderMode }
        : undefined,
    [armedPlayerId, inspectedPlayerId, exitCommanderMode],
  )

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <GameBoardStage
        playerCount={playerCount}
        layoutVariant={layoutVariant}
        renderGrid={(boardOrientation) => (
          <PlayerGrid
            boardOrientation={boardOrientation}
            players={runtime.game.players}
            system={system}
            lifeStep={runtime.game.lifeStep}
            layoutVariant={layoutVariant}
            disabled={menuOpen}
            isPlayerEliminated={
              commanderDamageEnabled
                ? (player) => isEliminatedByCommanderDamage(runtime.game, player.id)
                : undefined
            }
            commanderDamage={
              commanderDamageEnabled
                ? {
                    incomingFor: (player) => incomingCommanderDamage(runtime.game, player.id),
                    armedPlayerId,
                    inspection: { playerId: inspectedPlayerId, onChange: setInspectedPlayerId },
                    onPressSword: toggleSword,
                    onStage: assignCommanderDamage,
                  }
                : undefined
            }
            onChange={runtime.changeLife}
          />
        )}
        menu={{
          open: menuOpen,
          actions: radialActions,
          variant: menuButtonStyle,
          seatColors,
          exitAction,
          ...(match
            ? {
                statusLine: {
                  text: `${matchContextLabel(runtime.game)} · Best of ${match.bestOf}`,
                  tone: "caughtUp" as const,
                  onPress: openMatchScore,
                },
              }
            : {}),
          onToggle: toggleMenu,
          onClose: closeMenu,
        }}
        windowOverlay={
          menuOpen && onDecks && onSettings && onAccount ? (
            <FloatingAppNavigation
              destinationLabel="Decks"
              accountLabel={accountLabel}
              onDestination={onDecks}
              onSettings={onSettings}
              onAccount={onAccount}
            />
          ) : null
        }
      />

      {layoutPickerOpen ? (
        <DialogCard
          visible
          onClose={closePanel}
          origin={menuDialogOrigin}
          backdropTestID="layout-picker-backdrop"
          backdropAccessibilityLabel="Close layout chooser"
          dialogTestID="layout-picker-dialog"
          accessibilityViewIsModal
          wide
        >
          <Text text="Layout" preset="subheading" style={themed($dialogText)} />
          <PlayerLayoutPicker
            playerCount={playerCount}
            value={layoutVariant}
            testID="layout"
            onChange={(layout) => {
              runtime.changeLayout(layout)
              closePanel()
            }}
          />
          <Button tx="game:cancel" style={themed($menuItem)} onPress={closePanel} />
        </DialogCard>
      ) : null}

      {match && !menuOpen ? (
        // why: the standing is glanceable only; it never sits between a thumb and the life controls.
        <View pointerEvents="none" style={[themed($matchLayer), { top: insets.top + 4 }]}>
          <Text
            testID="match-context"
            accessibilityLabel={`${matchContextLabel(runtime.game)}, best of ${match.bestOf}`}
            size="xxs"
            weight="medium"
            text={matchContextLabel(runtime.game)}
            style={themed($matchContextText)}
          />
        </View>
      ) : null}

      {endSource ? (
        <LocalGameEndDialog
          game={runtime.game}
          origin={menuDialogOrigin}
          singleWinner={Boolean(match)}
          onClose={() => setEndSource(undefined)}
          onEnd={confirmEnd}
          onAbandon={onGameAbandoned ? abandonGame : undefined}
        />
      ) : null}

      {matchOpen && match ? (
        <DialogCard
          visible
          onClose={() => setMatchOpen(false)}
          backdropTestID="match-backdrop"
          backdropAccessibilityLabel="Close match score"
          dialogTestID="match-dialog"
          accessibilityViewIsModal
        >
          <Text text={`Best of ${match.bestOf} · Game ${match.gameNumber}`} preset="subheading" />
          <View style={themed($matchScore)}>
            {runtime.game.players.map((player, seat) => (
              <View key={player.id} style={themed($matchScoreRow)}>
                <Text text={player.name} numberOfLines={1} style={themed($matchScoreName)} />
                <Text text={String(match.wins[seat])} weight="medium" />
              </View>
            ))}
            {match.draws ? (
              <Text size="xs" text={drawsLabel(match.draws)} style={themed($dialogText)} />
            ) : null}
          </View>
          <Button
            testID="end-match-button"
            text="End match"
            disabled={match.gameNumber === 1 || hasLocalGameStarted(runtime.game)}
            accessibilityHint="Ends the match after its last finished game"
            style={themed($menuItem)}
            onPress={openEndMatch}
          />
          <Button text="Close" style={themed($menuItem)} onPress={() => setMatchOpen(false)} />
        </DialogCard>
      ) : null}

      {matchPrompt?.match ? (
        <DialogCard
          visible
          onClose={() => setMatchPrompt(undefined)}
          closeDisabled={!canContinueMatch(matchPrompt)}
          backdropTestID="match-prompt-backdrop"
          backdropAccessibilityLabel="Continue to the next game"
          dialogTestID="match-prompt-dialog"
          dialogAccessibilityRole="alert"
        >
          <Text text={`Game ${matchPrompt.match.gameNumber} saved`} preset="subheading" />
          {canContinueMatch(matchPrompt) ? null : (
            <Text
              size="xs"
              text="A match holds at most ten games, so this one ends here."
              style={themed($dialogText)}
            />
          )}
          <Text
            text={matchPrompt.players
              .map((player, seat) => `${player.name} ${matchScoreAfter(matchPrompt).wins[seat]}`)
              .join(" · ")}
            style={themed($dialogText)}
          />
          {matchScoreAfter(matchPrompt).draws ? (
            <Text
              size="xs"
              text={drawsLabel(matchScoreAfter(matchPrompt).draws)}
              style={themed($dialogText)}
            />
          ) : null}
          <View style={themed($dialogActions)}>
            <Button
              testID="match-prompt-end-button"
              text="End match"
              style={themed($dialogButton)}
              onPress={() => {
                setMatchEnding(matchPrompt)
                setMatchPrompt(undefined)
              }}
            />
            {canContinueMatch(matchPrompt) ? (
              <Button
                testID="next-game-button"
                text="Next game"
                preset="reversed"
                style={themed($dialogButton)}
                onPress={() => setMatchPrompt(undefined)}
              />
            ) : null}
          </View>
        </DialogCard>
      ) : null}

      {matchEnding ? (
        <LocalMatchEndDialog game={matchEnding} onClose={cancelEndMatch} onEnd={confirmEndMatch} />
      ) : null}

      {saved ? (
        <GameSavedToast
          key={saved.gameId}
          message={saved.message}
          onViewSummary={() => onViewSummary(saved.gameId)}
          onDismiss={dismissSavedToast}
        />
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "flex-start",
})
const $menuItem: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
const $matchLayer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 60,
  elevation: 60,
  alignItems: "center",
})
const $matchContextText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  opacity: 0.8,
})
const $matchScore: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $matchScoreRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $matchScoreName: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
