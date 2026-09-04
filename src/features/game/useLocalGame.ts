import { useCallback, useMemo, useRef, useState } from "react"
import * as Haptics from "expo-haptics"

import { useReducedMotion } from "@/utils/useReducedMotion"

import { applyGameCommand, canUndo, defaultCommandContext } from "./domain"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import type { GameCommand, LifeDelta, LocalGame, LocalGameResult, PlayerId } from "./types"

function defer(work: () => void) {
  setTimeout(work, 0)
}

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
    (command: GameCommand): LocalGame => {
      const next = applyGameCommand(gameRef.current, command, context)
      if (next === gameRef.current) return next
      gameRef.current = next
      setGame(next)
      defer(() => {
        if (next.status === "active") repository.saveActiveGame(next)
        else repository.archiveGame(next)
      })
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
    undo: () => dispatch({ type: "life.undo" }),
    finish: (result?: LocalGameResult) => dispatch({ type: "game.finish", result }),
    abandon: () => dispatch({ type: "game.abandon" }),
    discard: () => {
      repository.clearActiveGame()
      return gameRef.current
    },
  }
}
