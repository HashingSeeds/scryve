import { useEffect, useRef, useState } from "react"

import { useResultAnnouncer } from "@/components/ResultAnnouncer"
import { translate } from "@/i18n/translate"
import { captureAnalytics } from "@/utils/analytics"
import { useReducedMotion } from "@/utils/useReducedMotion"
import { useStableCallbacks } from "@/utils/useStableCallbacks"

import {
  armTool,
  claimFirst,
  clearFirst,
  clearResult,
  PROMPT_FADE_MS,
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
  settleAll,
  settleFirst,
  settleResult,
  SITTING_OUT,
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
const FADE_HOLD = "fade"

type State = {
  gameId: string
  mode: boolean
  leaving: DiceTool | null
  dice: DiceState
}

const CLOSED: Omit<State, "gameId"> = {
  mode: false,
  leaving: null,
  dice: EMPTY_DICE,
}

export function useDice(
  players: readonly Pick<GamePlayer, "id" | "name">[],
  gameId: string,
  system: unknown,
) {
  const rules = systemDice(system)
  const { die } = rules
  const [stored, setStored] = useState<State>()
  const state = stored?.gameId === gameId ? stored : { gameId, ...CLOSED }
  const { dice } = state
  const { announce, reset: resetAnnouncer, webMessage } = useResultAnnouncer()
  const reducedMotion = useReducedMotion()
  const holds = useRef(new Map<string, ReturnType<typeof setTimeout>>()).current
  const stable = useStableCallbacks()
  const seatKey = players.map(({ id }) => id).join(",")
  const lastRollAt = useRef<{ gameId: string; at: number }>(undefined)
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

  function set(next: DiceState, patch: Partial<Omit<State, "gameId" | "dice">> = {}) {
    setStored((current) => ({
      ...(current?.gameId === gameId ? current : { gameId, ...CLOSED }),
      ...patch,
      dice: next,
    }))
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

  // why: the seat prompts fade out on their own clock; a layout exit animation drew them at the wrong place on web.
  function fadePrompts(tool: DiceTool | null) {
    dropHold(FADE_HOLD)
    if (!tool || reducedMotion !== false) return null
    holds.set(
      FADE_HOLD,
      setTimeout(() => {
        holds.delete(FADE_HOLD)
        setStored((current) =>
          current?.gameId === gameId ? { ...current, leaving: null } : current,
        )
      }, PROMPT_FADE_MS),
    )
    return tool
  }

  const name = (seatId: PlayerId) => dicePlayerName(players, seatId)
  const seatIds = () => players.map(({ id }) => id)

  function settleBoard(from: DiceState) {
    players.forEach(({ id }) => dropHold(id))
    dropHold(FIRST_HOLD)
    return settleAll(from, seatIds())
  }

  const close = stable("close", () => {
    resetAnnouncer()
    // why: the pentagon is the only way out of dice mode, so putting the die away must keep the rolls on the seats and the roll-off's winner as the 1st chip.
    set({ ...settleBoard(dice), armed: null }, { mode: false, leaving: fadePrompts(dice.armed) })
  })

  // why: putting the game's die out for the table is the pod rolling for who goes first, so every seat still in rolls it at once; other dice wait for each seat's tap.
  const armForOthers = stable("armForOthers", (tool: DiceTool, inSeats: readonly PlayerId[]) => {
    const last = lastRollAt.current?.gameId === gameId ? lastRollAt.current.at : undefined
    captureAnalytics("dice_armed", {
      tool,
      source: "bag",
      system: systemId,
      ...(last !== undefined && { since_roll_ms: Date.now() - last }),
    })
    dropHold(FADE_HOLD)
    const armed = armTool(settleBoard(dice), tool)
    const patch = { mode: true, leaving: null }
    if (tool !== die || inSeats.length < 2) return set(armed, patch)
    const next = startRollOff(armed, inSeats, rules)
    lastRollAt.current = { gameId, at: Date.now() }
    captureAnalytics("dice_rolled", { tool, system: systemId })
    const message = rollOffAnnouncement(next.first, players)
    if (message) announce(message)
    set(next, patch)
  })

  function holdFirst(next: DiceState) {
    return settleFirst(next) === next ? next : hold(FIRST_HOLD, BLOOM_MS.first, settleFirst)(next)
  }
  // why: with the dice out, the roll-off's result stays up until a tap or Close dice puts it away.
  function settleLater(next: DiceState) {
    return state.mode ? next : holdFirst(next)
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
    set(settleLater(next))
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

  // why: with the dice out, a result stays up until the seat rolls again or the dice are put away.
  function rollSeat(player: GamePlayer, tool: DiceTool) {
    const rolled = rollForSeat(dice, player.id, tool)
    announce(rollLabel(player.name, rolled.roll))
    lastRollAt.current = { gameId, at: Date.now() }
    captureAnalytics("dice_rolled", { tool: rolled.roll.tool, system: systemId })
    const settle = (next: DiceState) => settleResult(next, player.id)
    set(state.mode ? rolled.state : hold(player.id, BLOOM_MS.roll, settle)(rolled.state))
  }

  const rollFor = stable("rollFor", rollSeat)

  const pressSeat = stable("pressSeat", (player: GamePlayer) => {
    const view = diceSeatView(dice, player.id)
    if (view?.kind === "rolloff" && view.status === "tied") {
      const next = rerollTies(dice)
      const message = rollOffAnnouncement(next.first, players)
      if (message) announce(message)
      return set(settleLater(next))
    }
    // why: once the pod's roll-off has a winner, a tap on any seat means the pod is done rolling, so it puts the dice away and the winner keeps the 1st chip.
    if (dice.armed && view?.kind === "rolloff" && (view.status === "won" || view.status === "lost"))
      return close()
    if (view?.kind === "rolloff" || view?.kind === "first" || view?.kind === "flip") {
      dropHold(FIRST_HOLD)
      return set(settleFirst(dice))
    }
    if (dice.armed) return rollSeat(player, dice.armed)
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

  const { armed } = dice
  return {
    firstPlayerId: firstPlayerSeat(dice),
    open: state.mode,
    die,
    close,
    webMessage,
    rollOff,
    flip,
    ask,
    gameStarted,
    grid: {
      bag: { tools: DICE_TOOLS, rollFor, armForOthers },
      armed,
      leaving: armed ? null : state.leaving,
      // why: an out seat takes no die while the dice are out, and its cover keeps a tap from changing its life.
      seatFor: (player: GamePlayer, out = false) =>
        out && armed ? SITTING_OUT : diceSeatView(dice, player.id),
      chipsFor: (player: GamePlayer) => diceSeatChips(dice, player.id),
      onPressSeat: pressSeat,
      onChoose: choose,
      onPressChip: pressChip,
    },
  }
}
