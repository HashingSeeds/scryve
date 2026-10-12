import { useEffect, useMemo, useRef, useState } from "react"

import type { RadialMenuTool } from "@/components/GameRadialMenu"
import { useResultAnnouncer } from "@/components/ResultAnnouncer"
import { useReducedMotion } from "@/utils/useReducedMotion"
import { useStableCallbacks } from "@/utils/useStableCallbacks"

import {
  armTool,
  clearFirst,
  clearResult,
  diceSeatChips,
  diceSeatView,
  EMPTY_DICE,
  firstPlayerSeat,
  flipForFirst,
  offerChoice,
  pickFirst,
  rerollTies,
  rollForSeat,
  rollOffAnnouncement,
  settleFirst,
  settleResult,
  startRollOff,
  toolLabel,
  type ChoiceReason,
  type DiceSeatChip,
  type DiceState,
  type DiceTool,
} from "./dice"
import type { GamePlayer, PlayerId } from "./types"

// why: a result stays large long enough to read across the table, then shrinks into its chip. Tapping it settles it sooner.
const BLOOM_MS = { d20: 5000, coin: 4500, first: 5000 } as const
const FIRST_HOLD = "first"

type State = {
  gameId: string
  /** why: dice mode is the Dice petal held out with the seats live; a first-player pick from the badge never enters it. */
  mode: boolean
  dice: DiceState
}

const CLOSED: Omit<State, "gameId"> = { mode: false, dice: EMPTY_DICE }

/** why: dice results are table talk, so they live on this device only and are gone when the game changes. Rolls belong to dice mode; who goes first belongs to the game's start and clears on its first life change. */
export function useDice(players: readonly GamePlayer[], gameId: string) {
  const [stored, setStored] = useState<State>()
  const state = stored?.gameId === gameId ? stored : { gameId, ...CLOSED }
  const { dice } = state
  const { announce, reset: resetAnnouncer, webMessage } = useResultAnnouncer()
  const reducedMotion = useReducedMotion()
  const holds = useRef(new Map<string, ReturnType<typeof setTimeout>>()).current
  const stable = useStableCallbacks()
  const seatKey = players.map(({ id }) => id).join(",")

  function dropHold(key: string) {
    clearTimeout(holds.get(key))
    holds.delete(key)
  }
  function dropHolds() {
    holds.forEach(clearTimeout)
    holds.clear()
  }
  // why: a pending settle or web announcement from the last game must not land on the next one.
  useEffect(
    () => () => {
      dropHolds()
      resetAnnouncer()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, seatKey],
  )

  function update(patch: Partial<Omit<State, "gameId">>) {
    setStored((current) => ({
      ...(current?.gameId === gameId ? current : { gameId, ...CLOSED }),
      ...patch,
    }))
  }
  function set(next: DiceState, patch: Partial<Omit<State, "gameId" | "dice">> = {}) {
    update({ ...patch, dice: next })
  }
  /** why: reduced motion skips the bloom; otherwise it holds, then settles through the latest state so a newer roll on the seat is never cut short. */
  function hold(key: string, ms: number, settle: (dice: DiceState) => DiceState) {
    dropHold(key)
    if (reducedMotion !== false) return settle
    holds.set(
      key,
      setTimeout(() => {
        holds.delete(key)
        setStored((current) =>
          current?.gameId === gameId ? { ...current, dice: settle(current.dice) } : current,
        )
      }, ms),
    )
    return (dice: DiceState) => dice
  }

  const name = (seatId: PlayerId) => players.find(({ id }) => id === seatId)?.name ?? "Player"
  const seatIds = () => players.map(({ id }) => id)

  const close = stable("close", () => {
    players.forEach(({ id }) => dropHold(id))
    resetAnnouncer()
    set({ ...dice, armed: null, results: {} }, { mode: false })
  })

  const arm = stable("arm", (tool: DiceTool) => set(armTool(dice, tool), { mode: true }))

  function holdFirst(next: DiceState) {
    return firstPlayerSeat(next) ? hold(FIRST_HOLD, BLOOM_MS.first, settleFirst)(next) : next
  }
  function crown(next: DiceState) {
    const winner = firstPlayerSeat(next)
    if (winner) announce(`${name(winner)} goes first`)
    return holdFirst(next)
  }

  const rollOff = stable("rollOff", () => {
    const next = startRollOff(dice, seatIds())
    const message = rollOffAnnouncement(next.first, players)
    if (message) announce(message)
    set(holdFirst(next))
  })

  const flip = stable("flip", () => {
    const winner = flipForFirst(seatIds())
    announce(`${name(winner)} won the flip. Go first or second`)
    set(offerChoice(dice, winner, "flip"))
  })

  const ask = stable("ask", (seatId: PlayerId, reason: ChoiceReason) => {
    announce(`${name(seatId)}, go first or second`)
    set(offerChoice(dice, seatId, reason))
  })

  // why: once play has begun, a pick still on its way out settles without leaving a chip.
  const gameStarted = stable("gameStarted", () => {
    dropHold(FIRST_HOLD)
    set(clearFirst(dice))
  })

  const pressSeat = stable("pressSeat", (player: GamePlayer) => {
    const rolled = rollForSeat(dice, player.id)
    if (rolled) {
      announce(`${player.name}, ${toolLabel(rolled.roll.tool)}, ${rolled.roll.value}`)
      const settle = (next: DiceState) => settleResult(next, player.id)
      return set(hold(player.id, BLOOM_MS[rolled.roll.tool], settle)(rolled.state))
    }
    const view = diceSeatView(dice, player.id)
    if (view?.kind === "rolloff" && view.status === "tied") {
      const next = rerollTies(dice)
      const message = rollOffAnnouncement(next.first, players)
      if (message) announce(message)
      return set(holdFirst(next))
    }
    if (view?.kind === "rolloff" || view?.kind === "first") {
      dropHold(FIRST_HOLD)
      return set(settleFirst(dice))
    }
    if (view?.kind === "roll") {
      dropHold(player.id)
      set(settleResult(dice, player.id))
    }
  })

  const choose = stable("choose", (player: GamePlayer, order: "first" | "second") => {
    const ids = seatIds()
    const winner = order === "first" ? player.id : ids[(ids.indexOf(player.id) + 1) % ids.length]
    const note = order === "second" ? `${player.name} chose second` : undefined
    set(crown(pickFirst(dice, winner, note)))
  })

  const clearChip = stable("clearChip", (player: GamePlayer, chip: DiceSeatChip) => {
    set(chip.kind === "first" ? clearFirst(dice) : clearResult(dice, player.id))
  })

  const { armed } = dice
  // why: innermost first, the order the petal lays them out from the pentagon outward.
  const tools: readonly RadialMenuTool[] = useMemo(
    () => [
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
    [arm, armed],
  )

  return {
    open: state.mode,
    close,
    tools,
    webMessage,
    rollOff,
    flip,
    ask,
    gameStarted,
    grid: {
      armed,
      seatFor: (player: GamePlayer) => diceSeatView(dice, player.id),
      chipsFor: (player: GamePlayer) => diceSeatChips(dice, player.id),
      onPressSeat: pressSeat,
      onChoose: choose,
      onClearChip: clearChip,
    },
  }
}
