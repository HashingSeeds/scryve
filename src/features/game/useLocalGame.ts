import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Platform } from "react-native"
import * as Haptics from "expo-haptics"

import { translate } from "@/i18n/translate"
import { captureGame, type GameEndSource } from "@/utils/analytics"
import { ErrorType, reportCrash } from "@/utils/crashReporting"
import { useReducedMotion } from "@/utils/useReducedMotion"

import {
  applyGameCommand,
  applyLocalTableAction,
  canUndo,
  createNextMatchGame,
  createRematch,
  defaultCommandContext,
  hasLocalGameStarted,
  hasPlayBegun,
  localTableRules,
  restartMatchGame,
  soleLoserSeat,
  withFirstChooser,
} from "./domain"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import type { PlayerGridLayoutVariant, SeatOrder } from "./playerLayouts"
import type { RoundClock } from "./roundClock"
import { createTableActions, type TableRuntime } from "./tableRuntime"
import type {
  GameCommand,
  LifeDelta,
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  PlayerId,
} from "./types"
import { EMPTY_TABLE } from "../../../convex/lib/table"

/**
 * why: `storedGame` is the game as the route last read it from storage. The route rereads on
 * focus, so a board left open under setup adopts renames and ended games instead of saving
 * its older copy over them. A new read wins because the board saves before it updates. The
 * exception is a board storage refused: a read of the same game no newer than the board is
 * its own last good save, so the board keeps its unsaved state. Each read is a new object, so
 * callers must keep it stable between reads. `ownerId` is the signed-in account, so a finished game is filed under it
 * for upload.
 */
export function useLocalGame(
  storedGame: LocalGame,
  repository: LocalGameRepository = localGameRepository,
  ownerId?: string,
) {
  const [game, setGame] = useState(storedGame)
  const [readGame, setReadGame] = useState(storedGame)
  const [unsavedGameId, setUnsavedGameId] = useState<string>()
  if (storedGame !== readGame) {
    setReadGame(storedGame)
    const staleRead = storedGame.id === unsavedGameId && storedGame.updatedAt <= game.updatedAt
    if (!staleRead) setGame(storedGame)
  }
  const reduceMotion = useReducedMotion()
  const deviceId = useMemo(() => repository.getDeviceId(), [repository])
  const context = useMemo(() => defaultCommandContext(deviceId), [deviceId])
  const gameRef = useRef(game)
  gameRef.current = game
  const saveFailureShown = useRef(false)

  // why: a full web storage quota (SCRYVE-23) throws on every save, which dropped each tap. Ending a game still throws so the end dialog reports the history write.
  const save = useCallback(
    (next: LocalGame) => {
      try {
        repository.saveActiveGame(next)
        saveFailureShown.current = false
        setUnsavedGameId(undefined)
      } catch (cause) {
        setUnsavedGameId(next.id)
        if (saveFailureShown.current) return
        saveFailureShown.current = true
        reportCrash(cause instanceof Error ? cause : new Error(String(cause)), ErrorType.HANDLED, {
          fingerprint: ["local-game-save-failed"],
        })
        showSaveFailure()
      }
    },
    [repository],
  )

  const dispatch = useCallback(
    (command: GameCommand, endSource?: GameEndSource): LocalGame => {
      const applied = applyGameCommand(gameRef.current, command, context)
      if (applied === gameRef.current) return applied
      const next = withFirstPlayerSettled(applied)
      if (next.status === "active") {
        save(next)
        if (!hasLocalGameStarted(gameRef.current) && hasLocalGameStarted(next))
          captureGame("game_started", { ...next, playerCount: next.players.length }, "local")
      } else repository.archiveGame(next, endSource, ownerId)
      gameRef.current = next
      setGame(next)
      return next
    },
    [context, ownerId, repository, save],
  )

  const assignCommanderDamage = useCallback(
    (fromPlayerId: PlayerId, toPlayerId: PlayerId, delta: number) => {
      const previous = gameRef.current
      const next = dispatch({ type: "commanderDamage.assign", fromPlayerId, toPlayerId, delta })
      if (next === previous) return
      if (reduceMotion === false && repository.hapticsEnabled()) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
      }
    },
    [dispatch, reduceMotion, repository],
  )

  const changeBoard = useCallback(
    (board: { layout?: PlayerGridLayoutVariant; seatOrder?: SeatOrder }) => {
      const current = gameRef.current
      const next = { ...current, ...board, updatedAt: Date.now() }
      save(next)
      gameRef.current = next
      setGame(next)
    },
    [save],
  )
  const changeLayout = useCallback(
    (layout: PlayerGridLayoutVariant) => {
      if (gameRef.current.layout !== layout) changeBoard({ layout })
    },
    [changeBoard],
  )
  const changeSeatOrder = useCallback(
    (seatOrder: SeatOrder) => changeBoard({ seatOrder }),
    [changeBoard],
  )

  // why: a round clock runs before the first tap, so an unsaved timed board would restart its clock when the route rebuilds it.
  const timedBoardId = game.clock && game.status === "active" ? game.id : undefined
  useEffect(() => {
    if (timedBoardId) save(gameRef.current)
  }, [save, timedBoardId])

  // why: clock changes are rare taps (pause, adjust, next turn), so saving each one stays off the per-tick path.
  const changeClock = useCallback(
    (update: (clock: RoundClock) => RoundClock | undefined) => {
      const current = gameRef.current
      if (current.status !== "active" || !current.clock) return
      const { clock: _previous, ...rest } = current
      const clock = update(current.clock)
      const next: LocalGame = { ...rest, ...(clock ? { clock } : {}), updatedAt: Date.now() }
      save(next)
      gameRef.current = next
      setGame(next)
    },
    [save],
  )

  const changeLife = useCallback(
    (playerId: PlayerId, delta: LifeDelta) => {
      dispatch({ type: "life.change", playerId, delta })
      if (reduceMotion === false && repository.hapticsEnabled()) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
      }
    },
    [dispatch, reduceMotion, repository],
  )

  const tableActions = useMemo(
    () =>
      createTableActions(
        () => {
          const current = gameRef.current
          if (current.status !== "active") return null
          return {
            table: current.table ?? EMPTY_TABLE,
            rules: localTableRules(current),
            playerIds: current.players.map(({ id }) => id),
            lifeOf: (playerId) => current.players.find(({ id }) => id === playerId)?.life,
            canAct: () => true,
          }
        },
        (action, operationId) => {
          const previous = gameRef.current
          const applied = applyLocalTableAction(previous, action, { operationId, now: Date.now() })
          if (applied === previous) return false
          const next = withFirstPlayerSettled(applied)
          save(next)
          if (!hasLocalGameStarted(previous) && hasLocalGameStarted(next))
            captureGame("game_started", { ...next, playerCount: next.players.length }, "local")
          gameRef.current = next
          setGame(next)
          return true
        },
      ),
    [save],
  )

  const replaceBoard = useCallback(
    (next: LocalGame) => {
      save(next)
      gameRef.current = next
      setGame(next)
      return next
    },
    [save],
  )

  const markFirstPlayerUsed = useCallback(() => {
    const current = gameRef.current
    if (!current.firstPlayerOffered) replaceBoard({ ...current, firstPlayerOffered: true })
  }, [replaceBoard])

  const setFirstPlayer = useCallback(
    (playerId: PlayerId | undefined) => {
      const current = gameRef.current
      if (
        current.status !== "active" ||
        hasPlayBegun(current) ||
        current.firstPlayerId === playerId ||
        (playerId !== undefined && !current.players.some(({ id }) => id === playerId))
      )
        return
      const { firstPlayerId: _previous, ...board } = current
      replaceBoard(playerId === undefined ? board : { ...board, firstPlayerId: playerId })
    },
    [replaceBoard],
  )

  const rematch = useCallback(() => replaceBoard(createRematch(gameRef.current)), [replaceBoard])

  const nextMatchGame = useCallback(
    () => replaceBoard(createNextMatchGame(gameRef.current)),
    [replaceBoard],
  )

  const restartMatchGameBoard = useCallback(
    () => replaceBoard(restartMatchGame(gameRef.current)),
    [replaceBoard],
  )

  const endMatch = useCallback(
    (matchId: string, outcomes: MatchSeatOutcome[]) => {
      const ended = repository.finishMatch(matchId, outcomes)
      if (!ended) throw new Error(translate("board:matchEnd.noFinishedGame"))
      if (gameRef.current.match?.id === matchId) {
        const last = repository.loadHistoryDetail(ended.id)?.game
        replaceBoard(
          withFirstChooser(createRematch(gameRef.current), last ? soleLoserSeat(last) : undefined),
        )
      }
      return ended
    },
    [replaceBoard, repository],
  )

  const latestMatchGame = useCallback(
    (matchId: string) => {
      const latest = repository.latestMatchGame(matchId)
      return latest ? repository.loadHistoryDetail(latest.id)?.game : undefined
    },
    [repository],
  )

  // why: the Pokémon seats memoize on this object, so it only changes when the table itself does, not on every life tap.
  const tableState = game.table ?? EMPTY_TABLE
  const tableRules = localTableRules(game)
  const tableRuntime = useMemo(
    (): TableRuntime => ({ ...tableActions, table: tableState, tableRules }),
    [tableActions, tableState, tableRules],
  )

  return {
    game,
    ...tableRuntime,
    tableRuntime,
    canUndo: canUndo(game, context.actorId),
    changeLife,
    assignCommanderDamage,
    changeLayout,
    changeSeatOrder,
    changeClock,
    undo: () => dispatch({ type: "life.undo" }),
    finish: (result?: LocalGameResult, endSource?: GameEndSource) =>
      dispatch({ type: "game.finish", result }, endSource),
    abandon: () => dispatch({ type: "game.abandon" }),
    rematch,
    nextMatchGame,
    restartMatchGame: restartMatchGameBoard,
    endMatch,
    markFirstPlayerUsed,
    setFirstPlayer,
    latestMatchGame,
    pendingMatchEnd: () => {
      const matchId = repository.loadPendingMatchEnd()
      return matchId ? latestMatchGame(matchId) : undefined
    },
    holdMatchEnd: (matchId: string) => repository.savePendingMatchEnd(matchId),
    discard: () => {
      repository.clearActiveGame()
      return gameRef.current
    },
  }
}

function showSaveFailure() {
  const title = translate("board:saveFailed.title")
  const message = translate("board:saveFailed.message")
  // why: react-native-web's Alert.alert is a no-op.
  if (Platform.OS === "web") globalThis.alert(`${title}\n\n${message}`)
  else Alert.alert(title, message)
}

/** why: any board action means cards are drawn, so it closes the first-player offer for good, in the same write as the change itself. Undoing the change never brings the offer back. */
function withFirstPlayerSettled(game: LocalGame): LocalGame {
  return game.firstPlayerOffered ? game : { ...game, firstPlayerOffered: true }
}
