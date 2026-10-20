import { useCallback, useEffect, useMemo, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import {
  $dialogActions,
  $dialogButton,
  $dialogText,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import type { FirstPlayerOffer } from "@/components/FirstPlayerChips"
import { FloatingAppNavigation } from "@/components/FloatingAppNavigation"
import type { GameMenuActions } from "@/components/GameRadialMenu"
import { getPlayerGridLayoutOptions, PlayerGrid } from "@/components/PlayerGrid"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { ResultLiveRegion } from "@/components/ResultAnnouncer"
import { Screen } from "@/components/Screen"
import { SeatArrangement } from "@/components/SeatArrangement"
import { Text } from "@/components/Text"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { BoardContextLabels } from "@/features/game/BoardContextLabels"
import { systemDice } from "@/features/game/dice"
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
import { type BoardSize, GameBoardStage } from "@/features/game/GameBoardStage"
import { GameSavedToast } from "@/features/game/GameSavedToast"
import { LifeLogContext, type LifeLogSource } from "@/features/game/LifeLog"
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
import { gameRules, openRules } from "@/features/rules/gameRules"
import { prefetchRules } from "@/features/rules/rulesSource"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { GameEndSource } from "@/utils/analytics"

import type { SystemId } from "../../convex/lib/systems"

export interface CurrentGameScreenProps {
  initialGame: LocalGame
  fresh?: boolean
  initialEndOpen?: boolean
  onDecks?: () => void
  onHistory?: () => void
  onRules?: (system: SystemId, ruleId?: string) => void
  onSetup?: () => void
  onConnect?: () => void
  onSettings?: () => void
  onAccount?: () => void
  accountEntry?: AccountEntry
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
  onRules,
  onSetup,
  onConnect,
  onSettings,
  onAccount,
  accountEntry = "account",
  onViewSummary,
  onGameAbandoned,
  repository,
  ownerId,
}: CurrentGameScreenProps) {
  useKeepAwake("count-local-game", { suppressDeactivateWarnings: true })
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const runtime = useLocalGame(initialGame, repository, ownerId)
  const { isFoil } = useRevenueCat()
  const system = runtime.game.system
  const rules = gameRules(system)
  useEffect(() => {
    if (rules?.kind === "text") prefetchRules(rules)
  }, [rules])
  const [menuOpen, setMenuOpen] = useState(false)
  const [boardSize, setBoardSize] = useState<BoardSize>()
  const [openTableSheets, setOpenTableSheets] = useState(0)
  const trackTableSheet = useCallback(
    (open: boolean) => setOpenTableSheets((count) => count + (open ? 1 : -1)),
    [],
  )
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
  const dice = useDice(runtime.game.players, runtime.game.id, system)
  const playBegun = hasPlayBegun(runtime.game)
  const diceGameStarted = dice.gameStarted
  const markFirstPlayerUsed = runtime.markFirstPlayerUsed
  useEffect(() => {
    if (playBegun) diceGameStarted()
  }, [playBegun, diceGameStarted])
  const firstPlayerUsed = runtime.game.firstPlayerOffered === true
  const loserSeat = runtime.game.firstChooserSeat
  const loser = loserSeat === undefined ? undefined : runtime.game.players[loserSeat]
  const { ask: diceAsk, die, flip: diceFlip, rollOff: diceRollOff } = dice
  const playerCount = runtime.game.players.length
  const { events } = runtime.game
  const lifeLog = useMemo((): LifeLogSource => ({ kind: "local", events }), [events])
  const firstPlayer = useMemo<FirstPlayerOffer | undefined>(() => {
    if (playBegun || firstPlayerUsed) return undefined
    const offer = (run: () => void) => () => {
      markFirstPlayerUsed()
      run()
    }
    if (loser && loserSeat !== undefined)
      return {
        color: loser.color,
        glyph: { seatNumber: loserSeat + 1, shape: loser.shape },
        label: translate("board:firstPlayer.chip.loserChooses", { name: loser.name }),
        accessibilityLabel: translate("board:firstPlayer.loserChooses", { name: loser.name }),
        onPress: offer(() => diceAsk(loser.id, "loss")),
      }
    if (systemDice(system).twoPlayerCoinFlip && playerCount === 2)
      return {
        color: colors.gameMenu.actions.dice,
        glyph: { tool: "coin" },
        label: translate("board:firstPlayer.chip.flip"),
        accessibilityLabel: translate("board:firstPlayer.flip"),
        onPress: offer(diceFlip),
      }
    return {
      color: colors.gameMenu.actions.dice,
      glyph: { tool: die },
      label: translate("board:firstPlayer.chip.roll"),
      accessibilityLabel: translate("board:firstPlayer.roll"),
      onPress: offer(diceRollOff),
    }
  }, [
    colors.gameMenu.actions.dice,
    diceAsk,
    diceFlip,
    die,
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
    setSaved({
      gameId: ended.id,
      message: ended.match
        ? translate("board:savedToast.matchSaved")
        : translate("board:savedToast.gameSaved"),
    })
  }

  function confirmEndMatch(outcomes: MatchSeatOutcome[]) {
    if (!matchEnding?.match) return
    const ended = runtime.endMatch(matchEnding.match.id, outcomes)
    setMatchEnding(undefined)
    setSaved({ gameId: ended.id, message: translate("board:savedToast.matchSaved") })
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

  const openGameRules =
    rules && (rules.kind === "link" || onRules)
      ? () => {
          closeMenu()
          openRules(rules, () => system && onRules?.(system))
        }
      : undefined
  const radialActions: GameMenuActions = useMemo(
    () => [
      {
        kind: "layout",
        label: translate("board:menu.layout"),
        onPress: (event) => {
          captureMenuDialogOrigin(event)
          setMenuOpen(false)
          setLayoutPickerOpen(true)
        },
      },
      { kind: "dice", label: translate("board:menu.dice"), tools: diceTools },
      {
        kind: "setup",
        label: translate("board:menu.game"),
        disabled: !onSetup,
        onPress: () => {
          closeMenu()
          onSetup?.()
        },
      },
      {
        kind: "decks",
        label: translate("common:appNavigation.decks"),
        disabled: !onDecks,
        onPress: () => {
          closeMenu()
          onDecks?.()
        },
      },
      isFresh
        ? {
            kind: "connect",
            label: translate("board:menu.connect"),
            disabled: !onConnect,
            onPress: () => {
              closeMenu()
              onConnect?.()
            },
          }
        : {
            kind: "end-game",
            label: translate("board:menu.end"),
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
      onConnect,
      onDecks,
      onSetup,
      showEndConfirmation,
    ],
  )

  const diceOpen = dice.open
  const closeDice = dice.close
  const exitAction = useMemo(
    () =>
      diceOpen
        ? { label: translate("board:menu.closeDice"), onPress: closeDice }
        : armedPlayerId || inspectedPlayerId
          ? { label: translate("board:menu.exitCommander"), onPress: exitCommanderMode }
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
      <LifeLogContext.Provider value={lifeLog}>
        <GameBoardStage
          playerCount={playerCount}
          layoutVariant={layoutVariant}
          onBoardSizeChange={setBoardSize}
          firstPlayer={openTableSheets > 0 ? undefined : firstPlayer}
          renderGrid={(boardOrientation) => (
            <PlayerGrid
              boardOrientation={boardOrientation}
              players={runtime.game.players}
              system={system}
              lifeStep={runtime.game.lifeStep}
              onOpenRule={(ruleId) => system && onRules?.(system, ruleId)}
              onTableSheetOpenChange={trackTableSheet}
              layoutVariant={layoutVariant}
              seatOrder={runtime.game.seatOrder}
              disabled={menuOpen}
              isPlayerFoil={isFoil ? () => true : undefined}
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
            exitAction,
            ...(match
              ? {
                  statusLine: {
                    text: translate("board:match.statusLine", {
                      context: matchContextLabel(runtime.game),
                      bestOf: match.bestOf,
                    }),
                    tone: "caughtUp" as const,
                    onPress: openMatchScore,
                  },
                }
              : {}),
            heldAction: diceOpen ? "dice" : undefined,
            onToggle: toggleMenu,
            onClose: closeMenu,
          }}
          windowOverlay={
            menuOpen && onHistory && onSettings && onAccount ? (
              <FloatingAppNavigation
                accountEntry={accountEntry}
                onRules={openGameRules}
                onHistory={onHistory}
                onSettings={onSettings}
                onAccount={onAccount}
              />
            ) : null
          }
        />
      </LifeLogContext.Provider>
      <ResultLiveRegion testID="dice-announcer" message={dice.webMessage} />

      {layoutPickerOpen ? (
        <DialogCard
          visible
          onClose={closePanel}
          origin={menuDialogOrigin}
          backdropTestID="layout-picker-backdrop"
          backdropAccessibilityLabel={translate("board:menu.closeLayoutChooser")}
          dialogTestID="layout-picker-dialog"
          accessibilityViewIsModal
          wide
        >
          <Text tx="board:menu.layout" preset="subheading" style={themed($dialogText)} />
          {layoutOptions.length > 1 ? (
            <PlayerLayoutPicker
              playerCount={playerCount}
              value={layoutVariant}
              testID="layout"
              onChange={(layout) => {
                runtime.changeLayout(layout)
                closePanel()
              }}
            />
          ) : null}
          <Text tx="board:seats.title" preset="subheading" style={themed($dialogText)} />
          <SeatArrangement
            players={runtime.game.players}
            layoutVariant={layoutVariant}
            board={boardSize}
            seatOrder={runtime.game.seatOrder}
            onChange={runtime.changeSeatOrder}
          />
          <Button tx="common:done" style={themed($menuItem)} onPress={closePanel} />
        </DialogCard>
      ) : null}

      {(match || clock) && !menuOpen ? (
        <BoardContextLabels
          match={
            match && matchLine
              ? {
                  line: matchLine,
                  accessibilityLabel: translate("board:match.contextLabel", {
                    context: matchLine,
                    bestOf: match.bestOf,
                  }),
                }
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
          backdropAccessibilityLabel={translate("board:match.closeScore")}
          dialogTestID="match-dialog"
          accessibilityViewIsModal
        >
          <Text
            tx="board:match.scoreTitle"
            txOptions={{ bestOf: match.bestOf, number: match.gameNumber }}
            preset="subheading"
          />
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
            tx="board:matchEnd.end"
            disabled={match.gameNumber === 1 || hasLocalGameStarted(runtime.game)}
            accessibilityHint={translate("board:match.endHint")}
            style={themed($menuItem)}
            onPress={openEndMatch}
          />
          <Button tx="common:close" style={themed($menuItem)} onPress={() => setMatchOpen(false)} />
        </DialogCard>
      ) : null}

      {matchPrompt?.match ? (
        <DialogCard
          visible
          onClose={() => setMatchPrompt(undefined)}
          closeDisabled={!canContinueMatch(matchPrompt)}
          backdropTestID="match-prompt-backdrop"
          backdropAccessibilityLabel={translate("board:match.continue")}
          dialogTestID="match-prompt-dialog"
          dialogAccessibilityRole="alert"
        >
          <Text
            tx="board:match.gameSaved"
            txOptions={{ number: matchPrompt.match.gameNumber }}
            preset="subheading"
          />
          {canContinueMatch(matchPrompt) ? null : (
            <Text size="xs" tx="board:match.limitReached" style={themed($dialogText)} />
          )}
          <Text
            text={matchPrompt.players
              .map((player, seat) =>
                translate("board:match.playerScore", {
                  name: player.name,
                  wins: matchScoreAfter(matchPrompt).wins[seat],
                }),
              )
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
              tx="board:matchEnd.end"
              style={themed($dialogButton)}
              onPress={() => {
                setMatchEnding(matchPrompt)
                setMatchPrompt(undefined)
              }}
            />
            {canContinueMatch(matchPrompt) ? (
              <Button
                testID="next-game-button"
                tx="board:match.nextGame"
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
