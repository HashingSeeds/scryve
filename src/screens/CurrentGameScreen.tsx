import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, TouchableOpacity, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import type { FirstPlayerOffer } from "@/components/FirstPlayerTabs"
import { PlayerGrid } from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { SeatArrangement } from "@/components/SeatArrangement"
import { Text } from "@/components/Text"
import type { TurnTabSeat } from "@/components/TurnTabs"
import { useSheetPresence } from "@/components/useSheetPresence"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { swapCount, useMatchSideboard } from "@/features/decks/matchSideboard"
import { SideboardSwapSheet } from "@/features/decks/SideboardSwapSheet"
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
import type { BoardTurnTab } from "@/features/game/GameBoardStage"
import { GameLogDialog } from "@/features/game/GameLogDialog"
import { GameToast } from "@/features/game/GameToast"
import { LifeLogContext, type LifeLogSource } from "@/features/game/LifeLog"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import { LocalMatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import { localGameRepository, type LocalGameRepository } from "@/features/game/localPersistence"
import { playCommanderLethal } from "@/features/game/playSystems"
import { stepRoundTurn } from "@/features/game/roundClock"
import { RoundClockDialog } from "@/features/game/RoundClockDialog"
import {
  HideTurnTabDialog,
  reportTurnTabGame,
  TurnDialog,
  useTurnTabPrefs,
} from "@/features/game/TurnDialog"
import { offersToHideTurnTab } from "@/features/game/turnTab"
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

import { outReason } from "../../convex/lib/outReason"
import type { SystemId } from "../../convex/lib/systems"
import { nextTurnSeat, type Turn } from "../../convex/lib/turns"

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
  const [sideboardOpen, setSideboardOpen] = useState(false)
  // why: iOS can't present the sideboard sheet until the match prompt's Modal has faded out.
  const [promptGone, setPromptGone] = useState(false)
  const sideboardSheet = useSheetPresence(
    sideboardOpen && (promptGone || Platform.OS !== "ios") ? true : undefined,
  )
  const closeSideboard = () => {
    setSideboardOpen(false)
    setPromptGone(false)
  }
  const [clockOpen, setClockOpen] = useState(false)
  const openClock = useCallback(() => setClockOpen(true), [])
  const closeClock = useCallback(() => setClockOpen(false), [])
  const [turnPrefs, setTurnPrefs] = useTurnTabPrefs(repository ?? localGameRepository)
  const [turnOpen, setTurnOpen] = useState(false)
  const [turnToast, setTurnToast] = useState<{
    operationId: string
    passerId: string
    message: string
    steppedRound: boolean
  }>()
  const [hideOffer, setHideOffer] = useState<{ turn?: Turn; playerCount: number }>()
  const [logOpen, setLogOpen] = useState(false)
  const openLog = useCallback(() => setLogOpen(true), [])
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
  const sideboard = useMatchSideboard(runtime.game, { game: system, format: runtime.game.format })
  const sideboardFirst = sideboard?.canSwap ? sideboard : undefined
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
    onLog: openLog,
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
  const turn = runtime.game.turn
  const active = runtime.game.status === "active"
  // why: a countdown is how a judge's official time is kept, so a counting-down game is treated as event play, where only a pass moves the turn.
  const casual = clock?.setup.mode !== "countdown"
  const turnSeats: TurnTabSeat[] = runtime.game.players.map((player, index) => ({
    playerId: player.id,
    seatNumber: index + 1,
    name: player.name,
    color: player.color,
    shape: player.shape,
  }))
  const turnSeat = turnSeats.find(({ playerId }) => playerId === turn?.playerId)
  const { passTurn, setTurn, undoTurn, setBank, changeClock } = runtime
  function nextPlayerId(current: Turn, clockwiseSlots: number[]) {
    const { players, seatOrder } = runtime.game
    const order = clockwiseSlots.flatMap((slot) => {
      const player = players[seatOrder?.[slot] ?? slot]
      return player ? [player.id] : []
    })
    return nextTurnSeat(order, current.playerId, (id) => outReason(outState, id) !== undefined)
  }
  function passFrom(current: Turn, clockwiseSlots: number[]) {
    const { players } = runtime.game
    const next = nextPlayerId(current, clockwiseSlots)
    if (!next) return
    const operationId = passTurn(current.playerId, next)
    if (!operationId) return
    const steppedRound = clock !== undefined && stepRoundTurn(clock, system, 1) !== clock
    if (steppedRound) changeClock((current) => stepRoundTurn(current, system, 1))
    const name = players.find(({ id }) => id === next)?.name ?? ""
    setTurnToast({
      operationId,
      passerId: current.playerId,
      message: translate("board:turn.passed", { number: current.number + 1, name }),
      steppedRound,
    })
  }
  function undoToastPass() {
    if (!turnToast) return
    if (undoTurn(turnToast.passerId, turnToast.operationId) && turnToast.steppedRound)
      changeClock((current) => stepRoundTurn(current, system, -1))
    setTurnToast(undefined)
  }
  const turnTab: BoardTurnTab | undefined =
    turnPrefs.enabled && active && !firstPlayer
      ? {
          turn,
          seat: turnSeat,
          canPass: true,
          clockStyle: turnPrefs.clock,
          passStyle: turnPrefs.pass,
          nextSeat: (slots) => {
            const next = turn && nextPlayerId(turn, slots)
            return turnSeats.find(({ playerId }) => playerId === next)
          },
          roundClock: clock,
          system,
          copies: "both",
          onPress: (slots) => (turn ? passFrom(turn, slots) : setTurnOpen(true)),
          onLongPress: () => setTurnOpen(true),
        }
      : undefined
  function answerHideOffer(hide: boolean) {
    if (!hideOffer) return
    if (hide) setTurnPrefs({ enabled: false })
    reportTurnTabGame({
      prefs: { enabled: true },
      turn: hideOffer.turn,
      playerCount: hideOffer.playerCount,
      mode: "local",
      hideOffer: hide ? "accepted" : "shown",
    })
    setHideOffer(undefined)
  }

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
    const ending = { turn: ended.turn, playerCount: ended.players.length }
    if (offersToHideTurnTab(turnPrefs, ended.turn)) {
      setTurnPrefs({ hideOffered: true })
      setHideOffer(ending)
    } else reportTurnTabGame({ prefs: turnPrefs, ...ending, mode: "local", hideOffer: "none" })
    setTurnToast(undefined)
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
      runtime.restartMatchGame(endSource)
      return
    }
    if (!onGameAbandoned) return
    runtime.discard(endSource)
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
          turnTab={turnTab}
          toast={
            saved ? (
              <GameToast
                key={saved.gameId}
                inline
                message={saved.message}
                actionTx="board:savedToast.summary"
                testID="game-saved-toast"
                actionTestID="game-saved-summary-button"
                onAction={() => onViewSummary(saved.gameId)}
                onDismiss={dismissSavedToast}
              />
            ) : runtime.abandoned ? (
              <GameToast
                key={runtime.abandoned.id}
                inline
                message={translate("board:abandonedToast.message")}
                actionTx="common:undo"
                testID="game-abandoned-toast"
                actionTestID="game-abandoned-undo-button"
                persistent
                onAction={runtime.undoAbandon}
              />
            ) : turnToast ? (
              <GameToast
                key={turnToast.operationId}
                inline
                message={turnToast.message}
                actionTx="common:undo"
                testID="turn-passed-toast"
                actionTestID="turn-passed-undo"
                onAction={undoToastPass}
                onDismiss={() => setTurnToast(undefined)}
              />
            ) : null
          }
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
      {(match || (clock && !turnTab)) && !menuOpen ? (
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
          clock={turnTab ? undefined : clock}
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

      {turnOpen ? (
        <TurnDialog
          turn={turn}
          seats={turnSeats}
          pick={
            !turn || casual
              ? {
                  canPick: () => true,
                  onPick: (playerId) => {
                    setTurn(turn?.playerId ?? playerId, playerId)
                    markFirstPlayerUsed()
                    setTurnOpen(false)
                  },
                }
              : undefined
          }
          onUndo={
            turn?.previous
              ? () => {
                  undoTurn(turn.previous!.playerId, turn.operationId)
                  setTurnToast(undefined)
                  setTurnOpen(false)
                }
              : undefined
          }
          prefs={turnPrefs}
          onPrefs={setTurnPrefs}
          onBank={turn ? (bankMs) => setBank(turn.playerId, bankMs) : undefined}
          onRoundClock={
            clock && active
              ? () => {
                  setTurnOpen(false)
                  setClockOpen(true)
                }
              : undefined
          }
          onClose={() => setTurnOpen(false)}
        />
      ) : null}

      {hideOffer ? <HideTurnTabDialog onAnswer={answerHideOffer} /> : null}

      {logOpen ? (
        <GameLogDialog
          players={runtime.game.players}
          events={events}
          turns={turnPrefs.enabled ? runtime.game.turnLog : undefined}
          canUndo={runtime.canUndo}
          origin={chrome.dialogOrigin}
          onUndo={runtime.undo}
          onClose={() => setLogOpen(false)}
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

      {matchPrompt?.match && !sideboardSheet.shown ? (
        <DialogCard
          visible={!sideboardOpen}
          onDismissed={sideboardOpen ? () => setPromptGone(true) : undefined}
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
          {sideboardFirst ? (
            <TouchableOpacity
              testID="sideboard-first"
              accessibilityRole="button"
              style={themed($sideboardFirst)}
              onPress={() => setSideboardOpen(true)}
            >
              <View style={$flex}>
                <Text weight="medium" tx="decks:sideboard.first" />
                <Text
                  size="xs"
                  tone="dim"
                  numberOfLines={1}
                  text={translate("decks:sideboard.firstDetail", {
                    deck:
                      runtime.game.account?.deckName ?? translate("play:newGame.deckFallbackName"),
                    side: swapCount(sideboardFirst.pool.side),
                  })}
                />
              </View>
              <Text
                size="sm"
                weight="medium"
                tx="decks:sideboard.openAction"
                style={themed($link)}
              />
            </TouchableOpacity>
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

      {sideboardSheet.shown && sideboardFirst ? (
        <SideboardSwapSheet
          visible={sideboardSheet.visible}
          onDismissed={sideboardSheet.onDismissed}
          pool={sideboardFirst.pool}
          swaps={sideboardFirst.swaps}
          onApply={(swaps) => {
            sideboardFirst.apply(swaps)
            closeSideboard()
          }}
          onClose={closeSideboard}
        />
      ) : null}

      {matchEnding ? (
        <LocalMatchEndDialog game={matchEnding} onClose={cancelEndMatch} onEnd={confirmEndMatch} />
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
const $flex: ViewStyle = { flex: 1, minWidth: 0 }
const $sideboardFirst: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 52,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $matchScore: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $matchScoreRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $matchScoreName: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
