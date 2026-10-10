import { useEffect, useMemo, useRef, useState } from "react"

import { asDeviceId, defaultCommandContext } from "@/features/game/domain"
import type { LocalGame } from "@/features/game/types"
import type { useLocalGame } from "@/features/game/useLocalGame"

import type { TableLink, TableLinkHandlers, TableLinkState } from "./bleTransport"
import {
  applyTablePatch,
  tablePatch,
  tableSnapshot,
  unconfirmedCommands,
  withPendingCommands,
  type PendingTableCommand,
  type TableAcks,
  type TableCommand,
  type TableMessage,
} from "./protocol"

export interface TableLinkStatus {
  state: TableLinkState
  detail?: string
  peers: number
}

type StartLink = (handlers: TableLinkHandlers) => Promise<TableLink>
type OnMessage = (message: TableMessage, link: TableLink | undefined) => void

function useLinkLifecycle(start: StartLink | undefined, onMessage: OnMessage) {
  const [status, setStatus] = useState<TableLinkStatus>({ state: "starting", peers: 0 })
  const link = useRef<TableLink | undefined>(undefined)
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  })

  useEffect(() => {
    if (!start) return
    let cancelled = false
    start({
      onMessage: (message) => onMessageRef.current(message, link.current),
      onState: (state, detail) => !cancelled && setStatus((s) => ({ ...s, state, detail })),
      onPeers: (peers) => !cancelled && setStatus((s) => ({ ...s, peers: peers.length })),
    }).then(
      (opened) => {
        if (cancelled) opened.close()
        else link.current = opened
      },
      (error: unknown) =>
        !cancelled &&
        setStatus((s) => ({
          ...s,
          state: "closed",
          detail: error instanceof Error ? error.message : String(error),
        })),
    )
    return () => {
      cancelled = true
      link.current?.close()
      link.current = undefined
    }
  }, [start])

  return { status, link }
}

// why: imported on use so boards that never open a table, and their tests, skip the native module.
const loadTransport = () => import("./bleTransport")

/** why: guests' commands land in the same handlers as local taps, so the host's game logic is the only one. */
export function useTableHost(
  sessionId: string | undefined,
  game: LocalGame,
  apply: Pick<ReturnType<typeof useLocalGame>, "changeLife" | "assignCommanderDamage">,
) {
  const [start] = useState(() => {
    if (!sessionId) return undefined
    const hostSession: StartLink = async (handlers) =>
      (await loadTransport()).hostTable(sessionId, handlers)
    return hostSession
  })
  const acks = useRef<TableAcks>({})
  const sentBoard = useRef<string | undefined>(undefined)

  // why: a new game or a changed seat list needs the whole board; anything else fits a patch.
  function boardMessage(current: LocalGame, full: boolean): TableMessage {
    const shape = `${current.id}:${current.players.map((player) => player.id).join(",")}`
    if (full || sentBoard.current !== shape) {
      sentBoard.current = shape
      return { type: "game", game: tableSnapshot(current), acks: { ...acks.current } }
    }
    return { type: "patch", patch: tablePatch(current), acks: { ...acks.current } }
  }

  const { status, link } = useLinkLifecycle(start, (message, reply) => {
    if (message.type === "sync") reply?.send(boardMessage(game, true))
    if (message.type !== "command") return
    acks.current[message.guest] = Math.max(acks.current[message.guest] ?? 0, message.id)
    const { command } = message
    if (command.type === "life.change") apply.changeLife(command.playerId, command.delta)
    else apply.assignCommanderDamage(command.fromPlayerId, command.toPlayerId, command.delta)
  })

  useEffect(() => {
    link.current?.send(boardMessage(game, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: only a new board should go out.
  }, [game, link])

  return status
}

export interface TableTiming {
  samples: number
  p50?: number
  p95?: number
  max?: number
  unanswered: number
}

const UNANSWERED_AFTER_MS = 5_000

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

export function useTableGuest(sessionId: string) {
  const [board, setBoard] = useState<LocalGame>()
  const [pending, setPending] = useState<PendingTableCommand[]>([])
  const [timing, setTiming] = useState<TableTiming>({ samples: 0, unanswered: 0 })
  const [guestId] = useState(() => Math.random().toString(36).slice(2, 8))
  const nextId = useRef(0)
  const sentAt = useRef(new Map<number, number>())
  const roundTrips = useRef<number[]>([])
  const [start] = useState(() => {
    const joinSession: StartLink = async (handlers) =>
      (await loadTransport()).joinTable(sessionId, handlers)
    return joinSession
  })

  function settle(acks: TableAcks) {
    const acked = acks[guestId] ?? 0
    setPending((current) => unconfirmedCommands(current, acked))
    const now = Date.now()
    for (const [id, at] of sentAt.current) {
      if (id > acked) continue
      roundTrips.current.push(now - at)
      sentAt.current.delete(id)
    }
    const sorted = [...roundTrips.current].sort((a, b) => a - b)
    setTiming({
      samples: sorted.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted.at(-1),
      unanswered: [...sentAt.current.values()].filter((at) => now - at > UNANSWERED_AFTER_MS)
        .length,
    })
  }

  const { status, link } = useLinkLifecycle(start, (message, reply) => {
    if (message.type === "game") setBoard(message.game)
    if (message.type === "patch")
      setBoard((current) => {
        const patched = current && applyTablePatch(current, message.patch)
        if (!patched) reply?.send({ type: "sync" })
        return patched ?? current
      })
    if (message.type === "game" || message.type === "patch") settle(message.acks)
  })

  const send = (command: TableCommand) => {
    const id = ++nextId.current
    sentAt.current.set(id, Date.now())
    setPending((current) => [...current, { id, command }])
    link.current?.send({ type: "command", command, guest: guestId, id })
  }
  const context = useMemo(() => defaultCommandContext(asDeviceId(`table-${guestId}`)), [guestId])
  const game = useMemo(
    () => board && withPendingCommands(board, pending, context),
    [board, context, pending],
  )
  return { status, game, send, timing }
}

/**
 * why: dev-only load test. Alternating +1/-1 on the first seat keeps the board steady while
 * every tap still makes the host send an update, so each one gets timed.
 */
export function useTableStress(
  guest: ReturnType<typeof useTableGuest>,
  taps: number | undefined,
  intervalMs = 250,
) {
  const sent = useRef(0)
  const guestRef = useRef(guest)
  useEffect(() => {
    guestRef.current = guest
  })
  const ready = guest.status.state === "connected" && Boolean(guest.game)

  useEffect(() => {
    if (!taps || !ready) return
    const timer = setInterval(() => {
      const { game, send } = guestRef.current
      const player = game?.players[0]
      if (!player || sent.current >= taps) return clearInterval(timer)
      send({ type: "life.change", playerId: player.id, delta: sent.current % 2 ? -1 : 1 })
      sent.current++
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, ready, taps])

  const { timing } = guest
  useEffect(() => {
    if (taps && timing.samples && (timing.samples % 25 === 0 || timing.samples === taps))
      console.warn("[table] timing", JSON.stringify({ taps, intervalMs, ...timing }))
  }, [intervalMs, taps, timing])
}
