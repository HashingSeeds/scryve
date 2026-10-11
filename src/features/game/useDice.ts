import { useEffect, useMemo, useRef, useState } from "react"

import type { RadialMenuTool } from "@/components/GameRadialMenu"
import { useResultAnnouncer } from "@/components/ResultAnnouncer"
import { useReducedMotion } from "@/utils/useReducedMotion"
import { useStableCallbacks } from "@/utils/useStableCallbacks"

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

/** why: dice results are table talk, so they live on this device only and are gone when dice close or the game changes. Any tool works from closed, so one tap on the menu both opens dice and acts. */
export function useDice(players: readonly GamePlayer[], gameId: string) {
  const [state, setState] = useState<{ gameId: string; dice: DiceState }>()
  const dice = state?.gameId === gameId ? state.dice : undefined
  const current = dice ?? EMPTY_DICE
  const { announce, reset: resetAnnouncer, webMessage } = useResultAnnouncer()
  const reducedMotion = useReducedMotion()
  const sweep = useRef<ReturnType<typeof setTimeout>[]>([])
  const stable = useStableCallbacks()
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

  const close = stable("close", () => {
    stopSweep()
    resetAnnouncer()
    setState(undefined)
  })

  const arm = stable("arm", (tool: DiceTool) => {
    stopSweep()
    set(armTool(current, tool))
  })

  const rollOff = stable("rollOff", () => {
    stopSweep()
    const next =
      current.board?.kind === "rolloff" && current.board.pool.length > 1
        ? rerollTies(current)
        : startRollOff(players.map(({ id }) => id))
    set(next)
    const message = rollOffAnnouncement(next.board, players)
    if (message) announce(message)
  })

  const first = stable("first", () => {
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
  })

  function pressSeat(player: GamePlayer) {
    if (!dice) return
    stopSweep()
    const rolled = rollForSeat(dice, player.id)
    if (!rolled) return set(clearSeat(dice, player.id))
    set(rolled.state)
    announce(`${player.name}, ${toolLabel(rolled.roll.tool)}, ${rolled.roll.value}`)
  }

  const armed = current.armed
  const tie = current.board?.kind === "rolloff" && current.board.pool.length > 1
  // why: innermost first, the order the menu lays them out from the pentagon outward.
  const tools: readonly RadialMenuTool[] = useMemo(
    () => [
      {
        key: "first",
        label: "First",
        accessibilityLabel: "Pick who goes first",
        dimmed: armed !== null,
        onPress: first,
      },
      {
        key: "rolloff",
        label: tie ? "Again" : "Roll\noff",
        accessibilityLabel: tie ? "Re-roll the tied seats" : "Every seat rolls, highest goes first",
        dimmed: armed !== null,
        onPress: rollOff,
      },
      {
        key: "coin",
        label: "Coin",
        accessibilityLabel: armed === "coin" ? "Coin armed, tap a seat" : "Flip a coin for a seat",
        selected: armed === "coin",
        dimmed: armed !== null && armed !== "coin",
        onPress: () => arm("coin"),
      },
      {
        key: "d20",
        label: "d20",
        accessibilityLabel: armed === "d20" ? "d20 armed, tap a seat" : "Roll a d20 for a seat",
        selected: armed === "d20",
        dimmed: armed !== null && armed !== "d20",
        onPress: () => arm("d20"),
      },
    ],
    [arm, armed, first, rollOff, tie],
  )

  return {
    open: dice !== undefined,
    close,
    tools,
    webMessage,
    grid: dice
      ? {
          armed: dice.armed,
          seatFor: (player: GamePlayer) => diceSeatView(dice, player.id),
          onPressSeat: pressSeat,
        }
      : undefined,
  }
}
