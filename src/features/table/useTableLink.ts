import { useEffect, useRef, useState } from "react"

import type { LocalGame } from "@/features/game/types"
import type { useLocalGame } from "@/features/game/useLocalGame"

import type { TableLink, TableLinkHandlers, TableLinkState } from "./bleTransport"
import { tableSnapshot, type TableCommand, type TableMessage } from "./protocol"

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
  const { status, link } = useLinkLifecycle(start, (message, reply) => {
    if (message.type === "sync") reply?.send({ type: "game", game: tableSnapshot(game) })
    if (message.type !== "command") return
    const { command } = message
    if (command.type === "life.change") apply.changeLife(command.playerId, command.delta)
    else apply.assignCommanderDamage(command.fromPlayerId, command.toPlayerId, command.delta)
  })

  useEffect(() => {
    link.current?.send({ type: "game", game: tableSnapshot(game) })
  }, [game, link])

  return status
}

export function useTableGuest(sessionId: string) {
  const [game, setGame] = useState<LocalGame>()
  const [start] = useState(() => {
    const joinSession: StartLink = async (handlers) =>
      (await loadTransport()).joinTable(sessionId, handlers)
    return joinSession
  })
  const { status, link } = useLinkLifecycle(start, (message) => {
    if (message.type === "game") setGame(message.game)
  })
  const send = (command: TableCommand) => link.current?.send({ type: "command", command })
  return { status, game, send }
}
