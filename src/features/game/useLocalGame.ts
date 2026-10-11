import { useCallback, useMemo, useRef, useState } from "react"
import * as Haptics from "expo-haptics"

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
  localTableRules,
  restartMatchGame,
  soleLoserSeat,
} from "./domain"
import {
  type FirstPlayerRecord,
  localGameRepository,
  type LocalGameRepository,
} from "./localPersistence"
import type { PlayerGridLayoutVariant } from "./playerLayouts"
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
 * its older copy over them. A new read always wins: the board saves before it updates, so
 * storage is never behind it. Each read is a new object, so callers must keep it stable
 * between reads. `ownerId` is the signed-in account, so a finished game is filed under it
 * for upload.
 */
export function useLocalGame(
  storedGame: LocalGame,
  repository: LocalGameRepository = localGameRepository,
  ownerId?: string,
) {
  const [game, setGame] = useState(storedGame)
  const [readGame, setReadGame] = useState(storedGame)
  if (storedGame !== readGame) {
    setReadGame(storedGame)
    setGame(storedGame)
  }
  const reduceMotion = useReducedMotion()
  const deviceId = useMemo(() => repository.getDeviceId(), [repository])
  const context = useMemo(() => defaultCommandContext(deviceId), [deviceId])
  const settings = useMemo(() => repository.loadSettings(), [repository])
  const gameRef = useRef(game)
  gameRef.current = game

  const dispatch = useCallback(
    (command: GameCommand, endSource?: GameEndSource): LocalGame => {
      const next = applyGameCommand(gameRef.current, command, context)
      if (next === gameRef.current) return next
      if (next.status === "active") {
        repository.saveActiveGame(next)
        if (!hasLocalGameStarted(gameRef.current) && hasLocalGameStarted(next))
          captureGame("game_started", { ...next, playerCount: next.players.length }, "local")
      } else repository.archiveGame(next, endSource, ownerId)
      gameRef.current = next
      setGame(next)
      return next
    },
    [context, ownerId, repository],
  )

  const assignCommanderDamage = useCallback(
    (fromPlayerId: PlayerId, toPlayerId: PlayerId, delta: number) => {
      const previous = gameRef.current
      const next = dispatch({ type: "commanderDamage.assign", fromPlayerId, toPlayerId, delta })
      if (next === previous) return
      if (settings.hapticsEnabled && reduceMotion === false) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
      }
    },
    [dispatch, reduceMotion, settings.hapticsEnabled],
  )

  const changeLayout = useCallback(
    (layout: PlayerGridLayoutVariant) => {
      const current = gameRef.current
      if (current.layout === layout) return
      const next = { ...current, layout, updatedAt: Date.now() }
      repository.saveActiveGame(next)
      gameRef.current = next
      setGame(next)
    },
    [repository],
  )

  const changeLife = useCallback(
    (playerId: PlayerId, delta: LifeDelta) => {
      dispatch({ type: "life.change", playerId, delta })
      if (settings.hapticsEnabled && reduceMotion === false) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
      }
    },
    [dispatch, reduceMotion, settings.hapticsEnabled],
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
          const next = applyLocalTableAction(previous, action, { operationId, now: Date.now() })
          if (next === previous) return false
          repository.saveActiveGame(next)
          if (!hasLocalGameStarted(previous) && hasLocalGameStarted(next))
            captureGame("game_started", { ...next, playerCount: next.players.length }, "local")
          gameRef.current = next
          setGame(next)
          return true
        },
      ),
    [repository],
  )

  // why: the first-player offer is per game and survives a reopen, so it is read with the game and written as it changes. It is table talk, so a storage failure is reported and the board plays on.
  const [firstPlayer, setFirstPlayer] = useState<{ gameId: string; record: FirstPlayerRecord }>()
  const readFirstPlayer = useCallback(
    (gameId: string): FirstPlayerRecord => {
      try {
        return repository.loadFirstPlayer(gameId)
      } catch (error) {
        reportFirstPlayerStorage(error)
        return { used: false }
      }
    },
    [repository],
  )
  const firstPlayerRecord =
    firstPlayer?.gameId === game.id ? firstPlayer.record : readFirstPlayer(game.id)
  const saveFirstPlayer = useCallback(
    (gameId: string, record: FirstPlayerRecord) => {
      try {
        repository.saveFirstPlayer(gameId, record)
      } catch (error) {
        reportFirstPlayerStorage(error)
      }
      setFirstPlayer({ gameId, record })
    },
    [repository],
  )
  const markFirstPlayerUsed = useCallback(() => {
    const current = gameRef.current
    const record =
      firstPlayer?.gameId === current.id ? firstPlayer.record : readFirstPlayer(current.id)
    if (!record.used) saveFirstPlayer(current.id, { ...record, used: true })
  }, [firstPlayer, readFirstPlayer, saveFirstPlayer])

  const replaceBoard = useCallback(
    (next: LocalGame) => {
      repository.saveActiveGame(next)
      gameRef.current = next
      setGame(next)
      return next
    },
    [repository],
  )

  /** why: the board that follows a finished game remembers who lost it, so that player can be offered the first choice. */
  const replaceAfter = useCallback(
    (ended: LocalGame, next: LocalGame) => {
      const loserSeat = soleLoserSeat(ended)
      saveFirstPlayer(
        next.id,
        loserSeat === undefined ? { used: false } : { used: false, loserSeat },
      )
      return replaceBoard(next)
    },
    [replaceBoard, saveFirstPlayer],
  )

  const rematch = useCallback(
    () => replaceAfter(gameRef.current, createRematch(gameRef.current)),
    [replaceAfter],
  )

  const nextMatchGame = useCallback(
    () => replaceAfter(gameRef.current, createNextMatchGame(gameRef.current)),
    [replaceAfter],
  )

  // why: a restarted game is the same game of the match, so the loser of the game before it keeps the first choice.
  const restartMatchGameBoard = useCallback(() => {
    const current = gameRef.current
    const { loserSeat } = readFirstPlayer(current.id)
    const next = restartMatchGame(current)
    saveFirstPlayer(next.id, loserSeat === undefined ? { used: false } : { used: false, loserSeat })
    return replaceBoard(next)
  }, [readFirstPlayer, replaceBoard, saveFirstPlayer])

  /** why: the match's last finished game is in history; ending it also hands the table a fresh match. */
  const endMatch = useCallback(
    (matchId: string, outcomes: MatchSeatOutcome[]) => {
      const ended = repository.finishMatch(matchId, outcomes)
      if (!ended) throw new Error("This match has no finished game to end.")
      if (gameRef.current.match?.id === matchId) {
        const last = repository.loadHistoryDetail(ended.id)?.game
        replaceAfter(last ?? gameRef.current, createRematch(gameRef.current))
      }
      return ended
    },
    [replaceAfter, repository],
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
    undo: () => dispatch({ type: "life.undo" }),
    finish: (result?: LocalGameResult, endSource?: GameEndSource) =>
      dispatch({ type: "game.finish", result }, endSource),
    abandon: () => dispatch({ type: "game.abandon" }),
    rematch,
    nextMatchGame,
    restartMatchGame: restartMatchGameBoard,
    endMatch,
    firstPlayer: firstPlayerRecord,
    markFirstPlayerUsed,
    latestMatchGame,
    /** why: a match that hit the game cap still owes its result after a restart; the board reopens the prompt from it. */
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

function reportFirstPlayerStorage(error: unknown) {
  reportCrash(error instanceof Error ? error : new Error(String(error)), ErrorType.HANDLED, {
    tags: { feature: "firstPlayer" },
  })
}
