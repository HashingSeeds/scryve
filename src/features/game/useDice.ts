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
  systemDie,
  toolLabel,
  type ChoiceReason,
  type DiceSeatChip,
  type DiceState,
  type DiceTool,
} from "./dice"
import type { GamePlayer, PlayerId } from "./types"

const BLOOM_MS = { d6: 5000, d20: 5000, coin: 4500, first: 2500 } as const
const FIRST_HOLD = "first"

type State = {
  gameId: string
  mode: boolean
  dice: DiceState
}

const CLOSED: Omit<State, "gameId"> = { mode: false, dice: EMPTY_DICE }

export function useDice(
  players: readonly Pick<GamePlayer, "id" | "name">[],
  gameId: string,
  system: unknown,
) {
  const die = systemDie(system)
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
    const next = startRollOff(dice, seatIds(), die)
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
        key: die,
        label: die,
        accessibilityLabel: armed === die ? `${die} armed, tap a seat` : `Roll a ${die} for a seat`,
        selected: armed === die,
        dimmed: armed !== null && armed !== die,
        onPress: () => arm(die),
      },
    ],
    [arm, armed, die],
  )

  return {
    open: state.mode,
    die,
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
