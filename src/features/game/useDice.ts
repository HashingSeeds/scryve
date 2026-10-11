import { useCallback, useEffect, useRef, useState } from "react"

import { useResultAnnouncer } from "@/components/ResultAnnouncer"
import { useReducedMotion } from "@/utils/useReducedMotion"

import {
  armTool,
  clearSeat,
  diceSeatView,
  EMPTY_DICE,
  randomIndex,
  rerollTies,
  rollForSeat,
  rollOffAnnouncement,
  showFirst,
  startRollOff,
  toolLabel,
  type DiceState,
  type DiceTool,
} from "./dice"
import type { GamePlayer } from "./types"

// why: the first-player sweep passes every seat once and then some, slowing as it lands, so the stop reads as chance rather than a jump.
const SWEEP_EXTRA_STEPS = 3
const sweepStepMs = (step: number) => 55 + step * step * 4

/** why: dice results are table talk, so they live on this device only and are gone when the strip closes or the game changes. */
export function useDice(players: readonly GamePlayer[], gameId: string) {
  const [state, setState] = useState<{ gameId: string; dice: DiceState }>()
  const dice = state?.gameId === gameId ? state.dice : undefined
  const { announce, reset: resetAnnouncer, webMessage } = useResultAnnouncer()
  const reducedMotion = useReducedMotion()
  const sweep = useRef<ReturnType<typeof setTimeout>[]>([])
  const seatKey = players.map(({ id }) => id).join(",")

  function stopSweep() {
    sweep.current.forEach(clearTimeout)
    sweep.current = []
  }
  // why: a sweep or a pending web announcement from the last game must not land on the next one.
  useEffect(
    () => () => {
      stopSweep()
      resetAnnouncer()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, seatKey],
  )

  function set(next: DiceState) {
    setState({ gameId, dice: next })
  }
  const show = useCallback(() => setState({ gameId, dice: EMPTY_DICE }), [gameId])

  function close() {
    stopSweep()
    resetAnnouncer()
    setState(undefined)
  }

  function arm(tool: DiceTool) {
    if (!dice) return
    stopSweep()
    set(armTool(dice, tool))
  }

  function rollOff() {
    if (!dice) return
    stopSweep()
    const next =
      dice.board?.kind === "rolloff" && dice.board.pool.length > 1
        ? rerollTies(dice)
        : startRollOff(players.map(({ id }) => id))
    set(next)
    const message = rollOffAnnouncement(next.board, players)
    if (message) announce(message)
  }

  function first() {
    if (!dice) return
    stopSweep()
    const count = players.length
    const finalIndex = randomIndex(count)
    const winner = players[finalIndex]
    if (!winner) return
    const settle = () => {
      set(showFirst(winner.id, true))
      announce(`${winner.name} goes first`)
    }
    if (reducedMotion !== false) return settle()
    const steps = count * 2 + SWEEP_EXTRA_STEPS
    const start = (((finalIndex - steps) % count) + count) % count
    let delay = 0
    for (let step = 0; step < steps; step += 1) {
      const seatId = players[(start + step) % count].id
      sweep.current.push(setTimeout(() => set(showFirst(seatId, false)), delay))
      delay += sweepStepMs(step)
    }
    sweep.current.push(setTimeout(settle, delay))
  }

  function pressSeat(player: GamePlayer) {
    if (!dice) return
    stopSweep()
    const rolled = rollForSeat(dice, player.id)
    if (!rolled) return set(clearSeat(dice, player.id))
    set(rolled.state)
    announce(`${player.name}, ${toolLabel(rolled.roll.tool)}, ${rolled.roll.value}`)
  }

  return {
    open: dice !== undefined,
    show,
    close,
    strip: dice
      ? {
          armed: dice.armed,
          tie: dice.board?.kind === "rolloff" && dice.board.pool.length > 1,
          webMessage,
          onArm: arm,
          onRollOff: rollOff,
          onFirst: first,
          onClose: close,
        }
      : undefined,
    grid: dice
      ? {
          armed: dice.armed,
          seatFor: (player: GamePlayer) => diceSeatView(dice, player.id),
          onPressSeat: pressSeat,
        }
      : undefined,
  }
}
