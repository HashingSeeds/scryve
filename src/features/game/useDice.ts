import { useEffect, useMemo, useRef, useState } from "react"

import type { RadialMenuTool, RadialMenuToolBag } from "@/components/GameRadialMenu"
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
  defaultTool,
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
  settleFirst,
  settleResult,
  startFlip,
  startRollOff,
  systemDice,
  toolLabel,
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
  bag: boolean
  recent: DiceTool | null
  leaving: DiceTool | null
  dice: DiceState
}

// why: only picking a tool closes the game menu; if opening the bag did too, closing the bag would leave the player with no menu to return to.
export function closingMenu(bag: RadialMenuToolBag, closeMenu: () => void): RadialMenuToolBag {
  const closing = (tool: RadialMenuTool): RadialMenuTool => ({
    ...tool,
    onPress: () => {
      closeMenu()
      tool.onPress()
    },
  })
  return { ...bag, recent: closing(bag.recent), tools: bag.tools.map(closing) }
}

const CLOSED: Omit<State, "gameId"> = {
  mode: false,
  bag: false,
  recent: null,
  leaving: null,
  dice: EMPTY_DICE,
}

function toolAccessibilityLabel(tool: DiceTool, armed: boolean) {
  if (tool === "coin")
    return armed ? translate("board:dice.coinArmed") : translate("board:dice.flipCoinForSeat")
  const die = toolLabel(tool)
  return armed
    ? translate("board:dice.dieArmed", { die })
    : translate("board:dice.rollDieForSeat", { die })
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

  const close = stable("close", () => {
    players.forEach(({ id }) => dropHold(id))
    resetAnnouncer()
    // why: the pentagon is the only way out of dice mode, so putting the die away must keep the rolls on the seats.
    const settled = players.reduce((next, { id }) => settleResult(next, id), dice)
    set({ ...settled, armed: null }, { mode: false, bag: false, leaving: fadePrompts(dice.armed) })
  })

  function armFrom(source: "pill" | "bag", tool: DiceTool) {
    const last = lastRollAt.current?.gameId === gameId ? lastRollAt.current.at : undefined
    captureAnalytics("dice_armed", {
      tool,
      source,
      system: systemId,
      ...(last !== undefined && { since_roll_ms: Date.now() - last }),
    })
    dropHold(FADE_HOLD)
    set(armTool(dice, tool), { mode: true, bag: false, recent: tool, leaving: null })
  }
  const arm = stable("arm", (tool: DiceTool) => armFrom("pill", tool))
  const pick = stable("pick", (tool: DiceTool) => armFrom("bag", tool))
  const toggleBag = stable("toggleBag", () => update({ bag: !state.bag }))

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

  const pressSeat = stable("pressSeat", (player: GamePlayer) => {
    const rolled = rollForSeat(dice, player.id)
    if (rolled) {
      announce(rollLabel(player.name, rolled.roll))
      lastRollAt.current = { gameId, at: Date.now() }
      captureAnalytics("dice_rolled", { tool: rolled.roll.tool, system: systemId })
      const settle = (next: DiceState) => settleResult(next, player.id)
      return set(hold(player.id, BLOOM_MS.roll, settle)(rolled.state), {
        mode: false,
        leaving: fadePrompts(dice.armed),
      })
    }
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

  const { armed } = dice
  const recent = state.recent ?? defaultTool(rules)
  const bagOpen = state.bag
  const tools: RadialMenuToolBag = useMemo(() => {
    const tool = (key: DiceTool, onPress: () => void): RadialMenuTool => ({
      key,
      label: toolLabel(key),
      accessibilityLabel: toolAccessibilityLabel(key, armed === key),
      selected: armed === key,
      onPress,
    })
    return {
      recent: tool(recent, () => arm(recent)),
      tools: DICE_TOOLS.map((key) => tool(key, () => pick(key))),
      open: bagOpen,
      onToggle: toggleBag,
    }
  }, [arm, armed, bagOpen, pick, recent, toggleBag])

  return {
    firstPlayerId: firstPlayerSeat(dice),
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
      leaving: armed ? null : state.leaving,
      seatFor: (player: GamePlayer) => diceSeatView(dice, player.id),
      chipsFor: (player: GamePlayer) => diceSeatChips(dice, player.id),
      onPressSeat: pressSeat,
      onChoose: choose,
      onPressChip: pressChip,
    },
  }
}
