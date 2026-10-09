import { useCallback, useMemo, useRef, useState } from "react"
import * as Haptics from "expo-haptics"

import { captureGame, type GameEndSource } from "@/utils/analytics"
import { useReducedMotion } from "@/utils/useReducedMotion"

import {
  applyGameCommand,
  canUndo,
  createNextMatchGame,
  createRematch,
  defaultCommandContext,
  hasLocalGameStarted,
  restartMatchGame,
} from "./domain"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import type { PlayerGridLayoutVariant } from "./playerLayouts"
import type {
  GameCommand,
  LifeDelta,
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  PlayerId,
} from "./types"

/**
 * why: `storedGame` is the game as the route last read it from storage. The route rereads on
 * focus, so a board left open under setup adopts renames and ended games instead of saving
 * its older copy over them. A new read always wins: the board saves before it updates, so
 * storage is never behind it. `ownerId` is the signed-in account, so a finished game is filed
 * under it for upload.
 */
export function useLocalGame(
  storedGame: LocalGame,
  repository: LocalGameRepository = localGameRepository,
  ownerId?: string,
) {
  const [game, setGame] = useState(storedGame)
  const [readGame, setReadGame] = useState(storedGame)
  if (storedGame.id !== readGame.id || storedGame.updatedAt !== readGame.updatedAt) {
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

  const replaceBoard = useCallback(
    (next: LocalGame) => {
      repository.saveActiveGame(next)
      gameRef.current = next
      setGame(next)
      return next
    },
    [repository],
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

  /** why: the match's last finished game is in history; ending it also hands the table a fresh match. */
  const endMatch = useCallback(
    (matchId: string, outcomes: MatchSeatOutcome[]) => {
      const ended = repository.finishMatch(matchId, outcomes)
      if (!ended) throw new Error("This match has no finished game to end.")
      if (gameRef.current.match?.id === matchId) rematch()
      return ended
    },
    [rematch, repository],
  )

  const latestMatchGame = useCallback(
    (matchId: string) => {
      const latest = repository.latestMatchGame(matchId)
      return latest ? repository.loadHistoryDetail(latest.id)?.game : undefined
    },
    [repository],
  )

  return {
    game,
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
