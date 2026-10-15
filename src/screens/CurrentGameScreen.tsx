import { useCallback, useEffect, useMemo, useState } from "react"
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
import { type GameMenuBadge, type RadialMenuAction } from "@/components/GameRadialMenu"
import { getPlayerGridLayoutOptions, PlayerGrid } from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { ResultLiveRegion } from "@/components/ResultAnnouncer"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { BoardContextLabels } from "@/features/game/BoardContextLabels"
import {
  canContinueMatch,
  drawsLabel,
  hasLocalGameStarted,
  hasPlayBegun,
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
import { RoundClockDialog } from "@/features/game/RoundClockDialog"
import type {
  GamePlayer,
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  PlayerId,
} from "@/features/game/types"
import { useDice } from "@/features/game/useDice"
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
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const runtime = useLocalGame(initialGame, repository, ownerId)
  const system = runtime.game.system
  const [menuOpen, setMenuOpen] = useState(false)
  const [resumedGameId] = useState(fresh ? undefined : initialGame.id)
  const [saved, setSaved] = useState<{ gameId: string; message: string }>()
  const [matchPrompt, setMatchPrompt] = useState<LocalGame | undefined>(() =>
    runtime.pendingMatchEnd(),
  )
  const [matchEnding, setMatchEnding] = useState<LocalGame>()
  const [matchOpen, setMatchOpen] = useState(false)
  const [clockOpen, setClockOpen] = useState(false)
  const openClock = useCallback(() => setClockOpen(true), [])
  const closeClock = useCallback(() => setClockOpen(false), [])
  const clock = runtime.game.clock
  const isFresh = runtime.game.id !== resumedGameId && !hasLocalGameStarted(runtime.game)
  const match = runtime.game.match
  const matchLine = matchContextLabel(runtime.game)
  const [endSource, setEndSource] = useState<GameEndSource | undefined>(
    initialEndOpen ? "stale_game_prompt" : undefined,
  )
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const dice = useDice(runtime.game.players, runtime.game.id)
  const playBegun = hasPlayBegun(runtime.game)
  const diceGameStarted = dice.gameStarted
  const markFirstPlayerUsed = runtime.markFirstPlayerUsed
  useEffect(() => {
    if (playBegun) diceGameStarted()
  }, [playBegun, diceGameStarted])
  const firstPlayerUsed = runtime.game.firstPlayerOffered === true
  const loserSeat = runtime.game.firstChooserSeat
  const loser = loserSeat === undefined ? undefined : runtime.game.players[loserSeat]
  const { ask: diceAsk, flip: diceFlip, rollOff: diceRollOff } = dice
  const playerCount = runtime.game.players.length
  const badge = useMemo<GameMenuBadge | undefined>(() => {
    if (playBegun || firstPlayerUsed) return undefined
    const offer = (run: () => void) => () => {
      markFirstPlayerUsed()
      run()
    }
    if (loser && loserSeat !== undefined)
      return {
        color: loser.color,
        glyph: { seatNumber: loserSeat + 1, shape: loser.shape },
        accessibilityLabel: `${loser.name} lost the last game. Choose who goes first`,
        onPress: offer(() => diceAsk(loser.id, "loss")),
      }
    // why: official Pokémon rules only cover two players; larger tables roll off like other games.
    if (system === "pokemon" && playerCount === 2)
      return {
        color: colors.gameMenu.actions.dice,
        glyph: { tool: "coin" },
        accessibilityLabel: "Flip for who goes first",
        onPress: offer(diceFlip),
      }
    return {
      color: colors.gameMenu.actions.dice,
      glyph: { tool: "d20" },
      accessibilityLabel: "Roll for who goes first",
      onPress: offer(diceRollOff),
    }
  }, [
    colors.gameMenu.actions.dice,
    diceAsk,
    diceFlip,
    diceRollOff,
    firstPlayerUsed,
    loser,
    loserSeat,
    markFirstPlayerUsed,
    playBegun,
    playerCount,
    system,
  ])
  const diceTools = useMemo(
    () =>
      dice.tools.map((tool) => ({
        ...tool,
        onPress: () => {
          setMenuOpen(false)
          tool.onPress()
        },
      })),
    [dice.tools],
  )
  const [menuDialogOrigin, setMenuDialogOrigin] = useState<DialogOrigin>()
  const [armedPlayerId, setArmedPlayerId] = useState<PlayerId | null>(null)
  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null)
  const commanderDamageEnabled = supportsCommanderDamage(system, runtime.game.format)

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
  const layoutVariant = runtime.game.layout ?? "auto"
  const layoutOptions = getPlayerGridLayoutOptions(playerCount)

  function confirmEnd(result: LocalGameResult) {
    const ended = runtime.finish(result, endSource)
    if (ended.status === "active") {
      setEndSource(undefined)
      return
    }
    if (ended.match && !ended.match.result) {
      // why: at the game cap the board waits for the match result, so Cancel or a restart cannot orphan the match.
      if (canContinueMatch(ended)) runtime.nextMatchGame()
      else runtime.holdMatchEnd(ended.match.id)
      setEndSource(undefined)
      setMatchPrompt(ended)
      return
    }
    runtime.rematch()
    setEndSource(undefined)
    setSaved({ gameId: ended.id, message: ended.match ? "Match saved" : "Game saved" })
  }

  function confirmEndMatch(outcomes: MatchSeatOutcome[]) {
    if (!matchEnding?.match) return
    const ended = runtime.endMatch(matchEnding.match.id, outcomes)
    setMatchEnding(undefined)
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

  function abandonGame() {
    setEndSource(undefined)
    if (match) {
      runtime.restartMatchGame()
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
      { kind: "dice", label: "Dice", tools: diceTools },
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
      diceTools,
      isFresh,
      layoutOptions.length,
      onConnect,
      onHistory,
      onSetup,
      showEndConfirmation,
    ],
  )

  const seatColors = useSeatColors(runtime.game.players)
  const diceOpen = dice.open
  const closeDice = dice.close
  const exitAction = useMemo(
    () =>
      diceOpen
        ? { label: "Close dice", onPress: closeDice }
        : armedPlayerId || inspectedPlayerId
          ? { label: "Exit commander damage", onPress: exitCommanderMode }
          : undefined,
    [armedPlayerId, closeDice, diceOpen, inspectedPlayerId, exitCommanderMode],
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
            getSeatDeck={(player) => {
              const account = runtime.game.account
              return player.id === account?.mePlayerId && account.deckVersionId
                ? { ownerId: account.ownerId, versionId: account.deckVersionId }
                : undefined
            }}
            table={runtime.tableRuntime}
            dice={dice.grid}
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
          heldAction: diceOpen ? "dice" : undefined,
          badge,
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
      <ResultLiveRegion testID="dice-announcer" message={dice.webMessage} />

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

      {(match || clock) && !menuOpen ? (
        <BoardContextLabels
          match={
            match && matchLine
              ? { line: matchLine, accessibilityLabel: `${matchLine}, best of ${match.bestOf}` }
              : undefined
          }
          clock={clock}
          system={system}
          top={insets.top}
          bottom={insets.bottom}
          onClockPress={clock && runtime.game.status === "active" ? openClock : undefined}
        />
      ) : null}

      {clockOpen && clock ? (
        <RoundClockDialog
          clock={clock}
          system={system}
          players={runtime.game.players}
          onChange={runtime.changeClock}
          onClose={closeClock}
        />
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
const $matchScore: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $matchScoreRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $matchScoreName: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
