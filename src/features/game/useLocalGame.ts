import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Haptics from "expo-haptics"

import { captureGame, type GameEndSource } from "@/utils/analytics"
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
import type { PlayerGridLayoutVariant } from "./playerLayouts"
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
      const applied = applyGameCommand(gameRef.current, command, context)
      if (applied === gameRef.current) return applied
      const next = withFirstPlayerSettled(gameRef.current, applied)
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

  // why: a round clock runs before the first tap, so an unsaved timed board would restart its clock when the route rebuilds it.
  const timedBoardId = game.clock && game.status === "active" ? game.id : undefined
  useEffect(() => {
    if (timedBoardId) repository.saveActiveGame(gameRef.current)
  }, [repository, timedBoardId])

  // why: clock changes are rare taps (pause, adjust, next turn), so saving each one stays off the per-tick path.
  const changeClock = useCallback(
    (update: (clock: RoundClock) => RoundClock | undefined) => {
      const current = gameRef.current
      if (current.status !== "active" || !current.clock) return
      const { clock: _previous, ...rest } = current
      const clock = update(current.clock)
      const next: LocalGame = { ...rest, ...(clock ? { clock } : {}), updatedAt: Date.now() }
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
          const applied = applyLocalTableAction(previous, action, { operationId, now: Date.now() })
          if (applied === previous) return false
          const next = withFirstPlayerSettled(previous, applied)
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

  const replaceBoard = useCallback(
    (next: LocalGame) => {
      repository.saveActiveGame(next)
      gameRef.current = next
      setGame(next)
      return next
    },
    [repository],
  )

  const markFirstPlayerUsed = useCallback(() => {
    const current = gameRef.current
    if (!current.firstPlayerOffered) replaceBoard({ ...current, firstPlayerOffered: true })
  }, [replaceBoard])

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
      if (!ended) throw new Error("This match has no finished game to end.")
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

/** why: the first point of play closes the first-player offer for good, in the same write as the change itself, so damage healed or a counter cleared never brings the offer back. The board before the change counts too, since a reopened save may already be in play without the marker. */
function withFirstPlayerSettled(previous: LocalGame, game: LocalGame): LocalGame {
  return !game.firstPlayerOffered && (hasPlayBegun(previous) || hasPlayBegun(game))
    ? { ...game, firstPlayerOffered: true }
    : game
}
