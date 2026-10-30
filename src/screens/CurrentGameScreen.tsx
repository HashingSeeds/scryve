import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import type { FirstPlayerOffer } from "@/components/FirstPlayerTabs"
import { PlayerGrid } from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { SeatArrangement } from "@/components/SeatArrangement"
import { Text } from "@/components/Text"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { BoardContextLabels } from "@/features/game/BoardContextLabels"
import type { AttackChange } from "@/features/game/commanderAttack"
import { CLAIM_CHIP, systemDice, type DiceSeatChip } from "@/features/game/dice"
import {
  canContinueMatch,
  drawsLabel,
  hasLocalGameStarted,
  hasPlayBegun,
  incomingCommanderDamage,
  localOutState,
  matchContextLabel,
  matchScoreAfter,
} from "@/features/game/domain"
import { GameBoard, useBoardChrome } from "@/features/game/GameBoard"
import type { BoardSize } from "@/features/game/GameBoardStage"
import { GameSavedToast } from "@/features/game/GameSavedToast"
import { LifeLogContext, type LifeLogSource } from "@/features/game/LifeLog"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import { LocalMatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import type { LocalGameRepository } from "@/features/game/localPersistence"
import { playCommanderLethal } from "@/features/game/playSystems"
import { RoundClockDialog } from "@/features/game/RoundClockDialog"
import type {
  CommanderSlot,
  GamePlayer,
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  PlayerId,
} from "@/features/game/types"
import { useCommanderAttack } from "@/features/game/useCommanderAttack"
import { useLocalGame } from "@/features/game/useLocalGame"
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
  onSupport?: () => void
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
  onSupport,
  onAccount,
  accountEntry = "account",
  onViewSummary,
  onGameAbandoned,
  repository,
  ownerId,
}: CurrentGameScreenProps) {
  const { themed } = useAppTheme()
  const insets = useSafeAreaInsets()
  const runtime = useLocalGame(initialGame, repository, ownerId)
  const { isFoil } = useRevenueCat()
  const system = runtime.game.system
  const [boardSize, setBoardSize] = useState<BoardSize>()
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
  const markFirstPlayerUsed = runtime.markFirstPlayerUsed
  const commanderLethal = playCommanderLethal(system, runtime.game.format)
  const commanderDamageEnabled = commanderLethal !== undefined
  const outState = useMemo(() => localOutState(runtime.game), [runtime.game])
  const seatDeck = (playerId: PlayerId) => {
    const account = runtime.game.account
    if (!account || playerId !== account.mePlayerId) return undefined
    if (account.deckVersionId) return { ownerId: account.ownerId, versionId: account.deckVersionId }
    return account.deckKey && account.deckFingerprint
      ? { deckKey: account.deckKey, fingerprint: account.deckFingerprint }
      : undefined
  }
  const commanderPort = {
    incoming: (to: PlayerId, commander?: CommanderSlot) =>
      incomingCommanderDamage(runtime.game, to, commander),
    commit: (from: PlayerId, changes: readonly AttackChange[]) =>
      changes.forEach(({ toPlayerId, commander, delta }) =>
        runtime.assignCommanderDamage(from, toPlayerId, delta, commander),
      ),
  }
  const attack = useCommanderAttack(commanderPort, { seatDeck })
  const attackDispatch = attack.dispatch
  const layoutVariant = runtime.game.layout ?? "auto"
  const chrome = useBoardChrome({
    gameId: runtime.game.id,
    system,
    players: runtime.game.players,
    layout: {
      value: layoutVariant,
      onChange: runtime.changeLayout,
      seats: (
        <SeatArrangement
          players={runtime.game.players}
          layoutVariant={layoutVariant}
          board={boardSize}
          seatOrder={runtime.game.seatOrder}
          onChange={runtime.changeSeatOrder}
        />
      ),
    },
    petals: [
      {
        kind: "setup",
        label: translate("board:menu.game"),
        disabled: !onSetup,
        onPress: () => onSetup?.(),
      },
      isFresh
        ? {
            kind: "connect",
            label: translate("board:menu.connect"),
            disabled: !onConnect,
            onPress: () => onConnect?.(),
          }
        : {
            kind: "end-game",
            label: translate("board:menu.end"),
            onPress: () => setEndSource("game_menu"),
          },
    ],
    attack,
    // why: rolling by hand means the players skipped the first-player offer.
    onDiceTool: markFirstPlayerUsed,
    statusLine: match
      ? {
          text: translate("board:match.statusLine", {
            context: matchContextLabel(runtime.game),
            bestOf: match.bestOf,
          }),
          tone: "caughtUp",
          onPress: () => setMatchOpen(true),
        }
      : undefined,
    accountEntry,
    onRules,
    onDecks,
    onHistory,
    onSettings,
    onSupport,
    onAccount,
  })
  const { menuOpen, dice } = chrome
  const { firstPlayerId } = dice
  const { setFirstPlayer } = runtime
  const settledFirstPlayer = useRef(firstPlayerId)
  useEffect(() => {
    if (firstPlayerId || settledFirstPlayer.current) setFirstPlayer(firstPlayerId)
    settledFirstPlayer.current = firstPlayerId
  }, [firstPlayerId, setFirstPlayer])
  const playBegun = hasPlayBegun(runtime.game)
  const diceGameStarted = dice.gameStarted
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
        glyph: { seatNumber: loserSeat + 1, shape: loser.shape, color: loser.color },
        accessibilityLabel: translate("board:firstPlayer.loserChooses", { name: loser.name }),
        onPress: offer(() => diceAsk(loser.id, "loss")),
      }
    if (systemDice(system).twoPlayerCoinFlip && playerCount === 2)
      return {
        glyph: { tool: "coin" },
        accessibilityLabel: translate("board:firstPlayer.flip"),
        onPress: offer(diceFlip),
      }
    return {
      glyph: { tool: die },
      accessibilityLabel: translate("board:firstPlayer.roll"),
      onPress: offer(diceRollOff),
    }
  }, [
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
  // why: while the offer stands, every seat carries an empty 1st that claims first in one tap.
  const claimingGrid = firstPlayer
    ? {
        ...dice.grid,
        chipsFor: (player: GamePlayer) => [...dice.grid.chipsFor(player), CLAIM_CHIP],
        onPressChip: (player: GamePlayer, chip: DiceSeatChip) => {
          if (chip.kind === "claim") markFirstPlayerUsed()
          dice.grid.onPressChip(player, chip)
        },
      }
    : dice.grid

  function toggleSword(player: GamePlayer) {
    markFirstPlayerUsed()
    attackDispatch({ type: "press", playerId: player.id })
  }

  function inspectCommanderDamage(playerId: PlayerId | null) {
    if (playerId) markFirstPlayerUsed()
    attackDispatch({ type: "inspect", playerId })
  }

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

  return (
    <Screen
      preset="fixed"
      fullWidth
      safeAreaEdges={[]}
      SystemBarsProps={{ hidden: true }}
      contentContainerStyle={themed($screen)}
    >
      <LifeLogContext.Provider value={lifeLog}>
        <GameBoard
          chrome={chrome}
          onBoardSizeChange={setBoardSize}
          firstPlayer={firstPlayer}
          renderGrid={(boardOrientation) => (
            <PlayerGrid
              boardOrientation={boardOrientation}
              players={runtime.game.players}
              system={system}
              lifeStep={runtime.game.lifeStep}
              onOpenRule={(ruleId) => system && onRules?.(system, ruleId)}
              onPlayStart={markFirstPlayerUsed}
              layoutVariant={layoutVariant}
              seatOrder={runtime.game.seatOrder}
              disabled={menuOpen}
              isPlayerFoil={isFoil ? () => true : undefined}
              outState={outState}
              commanderDamage={
                commanderDamageEnabled
                  ? {
                      incomingFor: commanderPort.incoming,
                      lethal: commanderLethal,
                      attack,
                      inspection: {
                        playerId: attack.inspectedPlayerId,
                        onChange: inspectCommanderDamage,
                      },
                      onPressSword: toggleSword,
                    }
                  : undefined
              }
              getSeatDeck={(player) => seatDeck(player.id)}
              table={runtime.tableRuntime}
              dice={claimingGrid}
              onChange={runtime.changeLife}
            />
          )}
        />
      </LifeLogContext.Provider>
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
          origin={chrome.dialogOrigin}
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
                preset="primary"
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
