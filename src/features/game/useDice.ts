import { useEffect, useRef, useState } from "react"

import { useResultAnnouncer } from "@/components/ResultAnnouncer"
import { translate } from "@/i18n/translate"
import { captureAnalytics } from "@/utils/analytics"
import { useReducedMotion } from "@/utils/useReducedMotion"
import { useStableCallbacks } from "@/utils/useStableCallbacks"

import {
  claimFirst,
  clearFirst,
  clearResult,
  DICE_TOOLS,
  dicePlayerName,
  diceSeatChips,
  diceSeatView,
  EMPTY_DICE,
  firstPlayerSeat,
  offerChoice,
  pickFirst,
  rerollTies,
  rollForSeat,
  rollLabel,
  rollOffAnnouncement,
  settleFirst,
  settleResult,
  startFlip,
  startRollOff,
  systemDice,
  type ChoiceReason,
  type DiceSeatChip,
  type DiceState,
  type DiceTool,
} from "./dice"
import type { GamePlayer, PlayerId } from "./types"

const BLOOM_MS = { roll: 2300, first: 2500, flip: 1100, tie: 1600 } as const
const FIRST_HOLD = "first"

type State = { gameId: string; dice: DiceState }

/** why: `rollers` are the seats that roll off and choose to go first; a Two-Headed Giant team rolls once, as its first player. */
export function useDice(
  players: readonly Pick<GamePlayer, "id" | "name">[],
  gameId: string,
  system: unknown,
  rollers?: readonly string[],
) {
  const rules = systemDice(system)
  const { die } = rules
  const [stored, setStored] = useState<State>()
  const dice = stored?.gameId === gameId ? stored.dice : EMPTY_DICE
  const { announce, reset: resetAnnouncer, webMessage } = useResultAnnouncer()
  const reducedMotion = useReducedMotion()
  const holds = useRef(new Map<string, ReturnType<typeof setTimeout>>()).current
  const stable = useStableCallbacks()
  const seatKey = players.map(({ id }) => id).join(",")
  const systemId = typeof system === "string" ? system : undefined

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

  function set(next: DiceState) {
    setStored({ gameId, dice: next })
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

  const name = (seatId: PlayerId) => dicePlayerName(players, seatId)
  const seatIds = () =>
    players.flatMap(({ id }) => (!rollers || rollers.includes(id) ? [id] : []))

  function holdFirst(next: DiceState) {
    return settleFirst(next) === next ? next : hold(FIRST_HOLD, BLOOM_MS.first, settleFirst)(next)
  }
  function crown(next: DiceState) {
    const winner = firstPlayerSeat(next)
    if (winner) announce(translate("board:dice.goesFirst", { name: name(winner) }))
    return holdFirst(next)
  }

  const rollOff = stable("rollOff", () => {
    const next = startRollOff(dice, seatIds(), rules)
    const message = rollOffAnnouncement(next.first, players)
    if (message) announce(message)
    set(holdFirst(next))
  })

  const flip = stable("flip", () => {
    const next = startFlip(dice, seatIds())
    if (next.first?.kind === "flip")
      announce(translate("board:dice.wonFlipGoFirstOrSecond", { name: name(next.first.seatId) }))
    set(hold(FIRST_HOLD, BLOOM_MS.flip, settleFirst)(next))
  })

  const claim = stable("claim", (player: GamePlayer) => {
    dropHold(FIRST_HOLD)
    announce(translate("board:dice.goesFirst", { name: player.name }))
    set(claimFirst(dice, player.id))
  })

  const rerollTied = stable("rerollTied", () => {
    const next = rerollTies(dice)
    if (next === dice) return
    const message = rollOffAnnouncement(next.first, players)
    if (message) announce(message)
    set(holdFirst(next))
  })
  const { first } = dice
  const tied = first?.kind === "rolloff" && first.pool.length > 1
  // why: the table rerolls a tie on its own, after a beat to read who tied; a fresh tie restarts the beat.
  useEffect(() => {
    if (!tied) return
    const timer = setTimeout(rerollTied, BLOOM_MS.tie)
    return () => clearTimeout(timer)
  }, [first, tied, rerollTied])

  const ask = stable("ask", (seatId: PlayerId, reason: ChoiceReason) => {
    announce(translate("board:dice.goFirstOrSecond", { name: name(seatId) }))
    set(offerChoice(dice, seatId, reason))
  })

  const gameStarted = stable("gameStarted", () => {
    dropHold(FIRST_HOLD)
    set(clearFirst(dice))
  })

  const rollFor = stable("rollFor", (player: GamePlayer, tool: DiceTool) => {
    const rolled = rollForSeat(dice, player.id, tool)
    announce(rollLabel(player.name, rolled.roll))
    captureAnalytics("dice_rolled", { tool: rolled.roll.tool, system: systemId })
    const settle = (next: DiceState) => settleResult(next, player.id)
    set(hold(player.id, BLOOM_MS.roll, settle)(rolled.state))
  })

  const pressSeat = stable("pressSeat", (player: GamePlayer) => {
    const view = diceSeatView(dice, player.id)
    if (view?.kind === "rolloff" && view.status === "tied") {
      const next = rerollTies(dice)
      const message = rollOffAnnouncement(next.first, players)
      if (message) announce(message)
      return set(holdFirst(next))
    }
    if (view?.kind === "rolloff" || view?.kind === "first" || view?.kind === "flip") {
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
    const note =
      order === "second" ? translate("board:dice.choseSecond", { name: player.name }) : undefined
    set(crown(pickFirst(dice, winner, note)))
  })

  const pressChip = stable("pressChip", (player: GamePlayer, chip: DiceSeatChip) => {
    if (chip.kind === "claim") return claim(player)
    set(chip.kind === "first" ? clearFirst(dice) : clearResult(dice, player.id))
  })

  return {
    firstPlayerId: firstPlayerSeat(dice),
    die,
    webMessage,
    rollOff,
    flip,
    ask,
    gameStarted,
    grid: {
      bag: { tools: DICE_TOOLS, rollFor },
      seatFor: (player: GamePlayer) => diceSeatView(dice, player.id),
      chipsFor: (player: GamePlayer) => diceSeatChips(dice, player.id),
      onPressSeat: pressSeat,
      onChoose: choose,
      onPressChip: pressChip,
    },
  }
}
