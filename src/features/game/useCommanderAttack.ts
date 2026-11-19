import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { useSeatCommanders } from "@/features/decks/seatCommander"
import type { SeatDeck } from "@/features/decks/useSeatDeckCards"

import {
  attackView,
  IDLE_ATTACK,
  reduceAttack,
  stagedTargets,
  type AttackAction,
  type AttackBoard,
  type AttackChange,
} from "./commanderAttack"
import type { CommanderSlot, PlayerId } from "./types"

export type CommanderDamagePort = {
  incoming: (to: PlayerId, commander?: CommanderSlot) => Record<PlayerId, number>
  commit: (from: PlayerId, changes: readonly AttackChange[]) => void
}

export type CommanderAttack = ReturnType<typeof useCommanderAttack>

// why: a seat with no deck or no commander chosen attacks with a commander and a partner, the partner sat out until brought in.
const NO_DECK = [{}, {}]

export function useCommanderAttack(
  port: CommanderDamagePort,
  {
    seatDeck,
    singleCommander,
    buffered = false,
  }: {
    seatDeck: (playerId: PlayerId) => SeatDeck | undefined
    singleCommander?: boolean
    buffered?: boolean
  },
) {
  const [state, setState] = useState(IDLE_ATTACK)
  const deck = useSeatCommanders(state.armed ? seatDeck(state.armed) : undefined)
  const shown = deck.length ? deck : NO_DECK
  const attackers = singleCommander ? shown.slice(0, 1) : shown
  const board: AttackBoard = {
    recorded: (from, to, commander) => port.incoming(to, commander)[from] ?? 0,
    commanders: attackers,
    buffered,
  }
  // why: two taps can land before a render, so the next tap reduces from the last tap's state rather than the rendered one.
  const current = useRef(state)
  const latest = useRef({ board, port })
  useLayoutEffect(() => {
    latest.current = { board, port }
  })
  const dispatch = useCallback((action: AttackAction) => {
    const { state: next, commit } = reduceAttack(current.current, action, latest.current.board)
    if (next === current.current) return
    current.current = next
    setState(next)
    if (commit) latest.current.port.commit(commit.from, commit.changes)
  }, [])

  return {
    armedPlayerId: state.armed,
    stagedTargets: buffered ? stagedTargets(state) : undefined,
    against: (to: PlayerId) => attackView(state, board, to),
    dispatch,
  }
}
