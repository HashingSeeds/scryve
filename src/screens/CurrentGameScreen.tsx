import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, TouchableOpacity, View } from "react-native"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { PlayerGrid } from "@/components/PlayerGrid"
import { Screen } from "@/components/Screen"
import { SeatArrangement } from "@/components/SeatArrangement"
import { Text } from "@/components/Text"
import { useSheetPresence } from "@/components/useSheetPresence"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { swapCount, useMatchSideboard } from "@/features/decks/matchSideboard"
import { SideboardSwapSheet } from "@/features/decks/SideboardSwapSheet"
import type { AttackChange } from "@/features/game/commanderAttack"
import {
  CLAIM_CHIP,
  MULLIGAN_RULE,
  mulliganStep,
  type DiceSeatChip,
  type DiceSeatView,
  type MulliganAction,
  type TurnChipState,
} from "@/features/game/dice"
import {
  canContinueMatch,
  drawsLabel,
  hasLocalGameStarted,
  hasPlayBegun,
  incomingCommanderDamage,
  isMatchInProgress,
  localLogPositions,
  localOutState,
  localTeams,
  matchContextLabel,
  matchScoreAfter,
} from "@/features/game/domain"
import { firstPlayerFlips, useFirstPlayerMode } from "@/features/game/FirstPlayerChoice"
import { GameBoard, useBoardChrome } from "@/features/game/GameBoard"
import type { BoardSize } from "@/features/game/GameBoardStage"
import { GameLogDialog } from "@/features/game/GameLogDialog"
import { GameToast } from "@/features/game/GameToast"
import { LifeLogContext, type LifeLogSource } from "@/features/game/LifeLog"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import { LocalMatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import { localGameRepository, type LocalGameRepository } from "@/features/game/localPersistence"
import { MatchScoreDialog } from "@/features/game/MatchScoreDialog"
import { playCommanderLethal } from "@/features/game/playSystems"
import { RoundClockDialog } from "@/features/game/RoundClockDialog"
import { teamIncoming, teamName } from "@/features/game/teams"
import {
  reportTurnsGame,
  TurnDialog,
  useChessMinutes,
  useTurnsEnabled,
} from "@/features/game/TurnDialog"
import { PASS_UNDO_MS, type TurnSeat } from "@/features/game/turnTab"
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
import { modeChipBeside } from "@/features/modes/modeChipBeside"
import { modeLogRow } from "@/features/modes/modeLogRow"
import { ModesDialog } from "@/features/modes/ModesDialog"
import { bagWithPlane, modeSeamFor, teamSeat, type SeamSeat } from "@/features/modes/modeSeamFor"
import { useBoardModes } from "@/features/modes/useBoardModes"
import { joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { GameEndSource } from "@/utils/analytics"

import { maxMulligans, mulliganHandSize } from "../../convex/lib/mulligans"
import { outReason } from "../../convex/lib/outReason"
import type { SystemId } from "../../convex/lib/systems"
import { nextTurnSeat, sharesTurn, turnLead } from "../../convex/lib/turns"

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
  const turnsStore = repository ?? localGameRepository
  const [turnsEnabled] = useTurnsEnabled(turnsStore)
  const [chessMinutes] = useChessMinutes(turnsStore)
  const chessAppliedTo = useRef<string>(undefined)
  const [turnOpen, setTurnOpen] = useState(false)
  const [mulliganDraft, setMulliganDraft] = useState<{
    gameId: string
    taken: number
    help: boolean
    skipped: boolean
  }>()
  const [passUndo, setPassUndo] = useState<{ operationId: string; passerId: string }>()
  const [logOpen, setLogOpen] = useState(false)
  const openLog = useCallback(() => setLogOpen(true), [])
  const clock = runtime.game.clock
  const isFresh = runtime.game.id !== resumedGameId && !hasLocalGameStarted(runtime.game)
  const match = runtime.game.match
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
  const teams = localTeams(runtime.game)
  const commanderPort = {
    incoming: teamIncoming(teams, (to: PlayerId, commander?: CommanderSlot) =>
      incomingCommanderDamage(runtime.game, to, commander),
    ),
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
    teams,
    layout: {
      value: layoutVariant,
      onChange: runtime.changeLayout,
      ...(teams
        ? {}
        : {
            seats: (
              <SeatArrangement
                players={runtime.game.players}
                layoutVariant={layoutVariant}
                board={boardSize}
                seatOrder={runtime.game.seatOrder}
                onChange={runtime.changeSeatOrder}
              />
            ),
          }),
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
  const [firstPlayerMode] = useFirstPlayerMode(turnsStore, system)
  const loserSeat = runtime.game.firstChooserSeat
  const loser = loserSeat === undefined ? undefined : runtime.game.players[loserSeat]
  const { ask: diceAsk, die, flip: diceFlip, rollOff: diceRollOff } = dice
  const playerCount = runtime.game.players.length
  const { events } = runtime.game
  const lifeLog = useMemo(
    (): LifeLogSource => ({ kind: "local", events, ...(teams ? { teams: teams } : {}) }),
    [events, teams],
  )
  const firstPlayerOpen = firstPlayerMode !== "off" && !playBegun && !firstPlayerUsed
  // why: after a loss the loser picks, whichever way setup settles the first game. Asking again on every open keeps the choice across a reopen.
  const loserAsk =
    firstPlayerOpen && loser && dice.grid.seatFor(loser) === undefined ? loser.id : undefined
  useEffect(() => {
    if (loserAsk) diceAsk(loserAsk, "loss")
  }, [diceAsk, loserAsk])
  const firstPlayerOff = firstPlayerMode === "off" && !firstPlayerUsed
  useEffect(() => {
    if (firstPlayerOff) diceGameStarted()
  }, [diceGameStarted, firstPlayerOff])
  const firstPlayerOffer: DiceSeatView | undefined =
    !firstPlayerOpen || loser
      ? undefined
      : firstPlayerMode === "pick"
        ? { kind: "pickOffer" }
        : { kind: "rollOffer", tool: firstPlayerFlips(system, playerCount) ? "coin" : die }
  const turn = runtime.game.turn
  const active = runtime.game.status === "active"
  const turnsOn = turnsEnabled && active
  useEffect(() => {
    if (!passUndo) return
    const expire = setTimeout(() => setPassUndo(undefined), PASS_UNDO_MS)
    return () => clearTimeout(expire)
  }, [passUndo])
  const casual = clock?.setup.mode !== "countdown"
  const turnSeats: TurnSeat[] = runtime.game.players.map((player, index) => ({
    playerId: player.id,
    seatNumber: index + 1,
    name: player.name,
    color: player.color,
    shape: player.shape,
  }))
  const { passTurn, setTurn, undoTurn, setBank, startTurn } = runtime
  useEffect(() => {
    if (!chessMinutes || !turn || turn.number !== 1 || turn.bank) return
    if (chessAppliedTo.current === turn.operationId) return
    chessAppliedTo.current = turn.operationId
    setBank(turn.playerId, chessMinutes * 60_000)
  }, [chessMinutes, turn, setBank])
  const { turnGroups } = runtime.game
  const nameOf = (playerId: string) => teamName(runtime.game.players, turnGroups, playerId)
  function nextOf(clockwiseSlots: number[]) {
    if (!turn) return undefined
    const { players, seatOrder } = runtime.game
    const order = clockwiseSlots.flatMap((slot) => {
      if (teams) return teams[slot] ?? []
      const player = players[seatOrder?.[slot] ?? slot]
      return player ? [player.id] : []
    })
    return nextTurnSeat(
      order,
      turn.playerId,
      (id) => outReason(outState, id) !== undefined,
      turnGroups,
    )
  }
  function passTo(next: string) {
    if (!turn) return
    const operationId = passTurn(turn.playerId, next)
    if (!operationId) return
    setPassUndo({ operationId, passerId: turn.playerId })
  }
  function undoPass() {
    if (!passUndo) return
    undoTurn(passUndo.passerId, passUndo.operationId)
    setPassUndo(undefined)
  }
  const boardModes = useBoardModes({
    modes: runtime.game.table?.modes,
    turn,
    groups: turnGroups,
    players: runtime.game.players,
    controls: () => true,
    act: runtime.tableRuntime.modeAction,
    turnsOn,
  })
  const dieOnChip = turnsOn && !!turn && !!boardModes.planar
  const turnChip: TurnChipState | undefined =
    turnsOn && turn
      ? {
          turn,
          canPress: true,
          nameOf,
          seatOf: (playerId) => turnSeats.find((seat) => seat.playerId === playerId),
          passLabelShown: turnsStore.passLabelShown(),
          onStart: () => startTurn(turn.playerId),
          onPass: (next) => {
            turnsStore.notePass()
            passTo(next)
          },
          onPause: () => {
            if (turn.priorityPlayerId) runtime.tableRuntime.setPriority(turn.playerId, undefined)
            else runtime.tableRuntime.pauseTurn(turn.playerId, !turn.paused)
          },
          onLongPress: () => setTurnOpen(true),
        }
      : undefined
  const slotOf = (playerId: string): SeamSeat | undefined => {
    if (teams) return teamSeat(teams, playerId)
    const index = runtime.game.players.findIndex(({ id }) => id === playerId)
    if (index < 0) return undefined
    const slot = runtime.game.seatOrder?.indexOf(index)
    return { slot: slot === undefined || slot < 0 ? index : slot }
  }

  const handSize = mulliganHandSize(system)
  const { account } = runtime.game
  const mulligan =
    mulliganDraft?.gameId === runtime.game.id
      ? mulliganDraft
      : { gameId: runtime.game.id, taken: 0, help: false, skipped: false }
  const mulliganSeat =
    handSize !== undefined &&
    account?.freeMulligans &&
    account.mulligans === undefined &&
    !teams &&
    !playBegun &&
    !mulligan.skipped
      ? account.mePlayerId
      : undefined
  const mulliganView: DiceSeatView | undefined =
    mulliganSeat && handSize !== undefined && account?.freeMulligans
      ? mulliganStep(mulligan.taken, account.freeMulligans, handSize, mulligan.help)
      : undefined
  const claiming = turnsOn && !turn && !firstPlayerOffer
  const seatGrid = {
    ...dice.grid,
    bag: bagWithPlane(dice.grid.bag, boardModes),
    seatFor: (player: GamePlayer) =>
      dice.grid.seatFor(player) ??
      firstPlayerOffer ??
      (player.id === mulliganSeat ? mulliganView : undefined),
    onMulligan: (action: MulliganAction) => {
      if (action === "keep") return runtime.keepHand(mulligan.taken)
      if (action === "rule") return system && onRules?.(system, MULLIGAN_RULE)
      setMulliganDraft({
        ...mulligan,
        ...(action === "mulligan" && handSize !== undefined && account?.freeMulligans
          ? { taken: Math.min(maxMulligans(account.freeMulligans, handSize), mulligan.taken + 1) }
          : {}),
        ...(action === "skip" ? { skipped: true } : {}),
        ...(action === "help" || action === "close" ? { help: action === "help" } : {}),
      })
    },
    onPressSeat: (player: GamePlayer) => {
      if (!firstPlayerOffer || dice.grid.seatFor(player)) return dice.grid.onPressSeat(player)
      markFirstPlayerUsed()
      if (firstPlayerOffer.kind === "rollOffer")
        return firstPlayerOffer.tool === "coin" ? diceFlip() : diceRollOff()
      if (turnsOn && !turn) setTurn(player.id, player.id)
      dice.grid.onPressChip(player, CLAIM_CHIP)
    },
    onChoose: (player: GamePlayer, order: "first" | "second") => {
      markFirstPlayerUsed()
      dice.grid.onChoose(player, order)
    },
    chipsFor: (player: GamePlayer): DiceSeatChip[] => {
      const chips = dice.grid.chipsFor(player)
      if (turnChip && sharesTurn(turnGroups, turnChip.turn.playerId, player.id))
        return [
          ...chips.filter(({ kind }) => kind === "roll"),
          {
            kind: "turn",
            state: {
              ...turnChip,
              beside: modeChipBeside(boardModes, player.id, {
                dieOnChip,
                plays: () => true,
              }),
            },
          },
        ]
      if (passUndo && sharesTurn(turnGroups, passUndo.passerId, player.id))
        return [...chips, { kind: "undoPass", onUndo: undoPass }]
      if (turnChip && turn?.bank && !turn.waiting) {
        const active =
          !!turn.priorityPlayerId && sharesTurn(turnGroups, turn.priorityPlayerId, player.id)
        return [
          ...chips,
          {
            kind: "priority",
            state: {
              turn,
              playerId: turnLead(turnGroups, player.id),
              active,
              canPress: true,
              onToggle: () =>
                runtime.tableRuntime.setPriority(player.id, active ? undefined : player.id),
            },
          },
        ]
      }
      return claiming ? [...chips, CLAIM_CHIP] : [...chips]
    },
    onPressChip: (player: GamePlayer, chip: DiceSeatChip) => {
      if (chip.kind === "claim") {
        markFirstPlayerUsed()
        if (turnsOn && !turn) setTurn(player.id, player.id)
      }
      dice.grid.onPressChip(player, chip)
    },
  }

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
    reportTurnsGame({
      turnsEnabled,
      turn: ended.turn,
      playerCount: ended.players.length,
      mode: "local",
    })
    setPassUndo(undefined)
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
          roundClock={clock && active ? { clock, system, onPress: openClock } : undefined}
          turns={
            turnChip ? { active: turnChip.turn.playerId, groups: turnGroups, nextOf } : undefined
          }
          seam={modeSeamFor(boardModes, {
            dieOnChip,
            turnChips: turnsOn && !!turn,
            slotOf,
          })}
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
              teams={teams}
              covered={menuOpen}
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
              dice={seatGrid}
              onChange={runtime.changeLife}
            />
          )}
        />
      </LifeLogContext.Provider>
      <ModesDialog modes={boardModes} />
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
          onTogglePause={
            turn?.bank && !turn.waiting
              ? () => runtime.tableRuntime.pauseTurn(turn.playerId, !turn.paused)
              : undefined
          }
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
                  setPassUndo(undefined)
                  setTurnOpen(false)
                }
              : undefined
          }
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

      {logOpen ? (
        <GameLogDialog
          players={runtime.game.players}
          events={events}
          turns={turnsEnabled ? runtime.game.turnLog : undefined}
          groups={turnGroups}
          counters={runtime.game.counterLog}
          sharedLife={!!teams}
          modes={boardModes.log.map(modeLogRow)}
          positionOf={localLogPositions(runtime.game)}
          canUndo={runtime.canUndo(turnsEnabled)}
          origin={chrome.dialogOrigin}
          onUndo={() => runtime.undo(turnsEnabled)}
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
        <MatchScoreDialog
          bestOf={match.bestOf}
          gameNumber={match.gameNumber}
          seats={runtime.game.players.map((player, seat) => ({
            id: player.id,
            name: player.name,
            wins: match.wins[seat],
          }))}
          draws={match.draws}
          onClose={() => setMatchOpen(false)}
        >
          {isMatchInProgress(runtime.game) ? (
            <Button
              testID="end-match-button"
              tx="board:matchEnd.end"
              disabled={match.gameNumber === 1 || hasLocalGameStarted(runtime.game)}
              accessibilityHint={translate("board:match.endHint")}
              style={themed($menuItem)}
              onPress={openEndMatch}
            />
          ) : (
            <Button
              testID="leave-match-button"
              tx="board:match.leave"
              accessibilityHint={translate("board:match.leaveHint")}
              style={themed($menuItem)}
              onPress={() => {
                setMatchOpen(false)
                runtime.leaveMatch()
              }}
            />
          )}
          <Button tx="common:close" style={themed($menuItem)} onPress={() => setMatchOpen(false)} />
        </MatchScoreDialog>
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
            text={joinParts(
              matchPrompt.players.map((player, seat) =>
                translate("board:match.playerScore", {
                  name: player.name,
                  wins: matchScoreAfter(matchPrompt).wins[seat],
                }),
              ),
            )}
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
