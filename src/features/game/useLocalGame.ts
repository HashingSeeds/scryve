import { useCallback, useMemo, useRef, useState } from "react"
import * as Haptics from "expo-haptics"

import { captureGame, type GameEndSource } from "@/utils/analytics"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { applyGameCommand, canUndo, defaultCommandContext, hasLocalGameStarted } from "./domain"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import type { PlayerGridLayoutVariant } from "./playerLayouts"
import type { GameCommand, LifeDelta, LocalGame, LocalGameResult, PlayerId } from "./types"

export function useLocalGame(
  initialGame: LocalGame,
  repository: LocalGameRepository = localGameRepository,
) {
  const [game, setGame] = useState(initialGame)
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
      } else repository.archiveGame(next, endSource)
      gameRef.current = next
      setGame(next)
      return next
    },
    [context, repository],
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
    discard: () => {
      repository.clearActiveGame()
      return gameRef.current
    },
  }
}
