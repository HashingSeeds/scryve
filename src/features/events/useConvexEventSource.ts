import { useMemo } from "react"
import { useMutation, useQuery } from "convex/react"

import { SyncLatency } from "@/features/connected/syncLatency"

import { standingsThroughRound } from "./eventLogic"
import type { EventSource, EventView } from "./eventSource"
import { useLatencyReports } from "./useLatencyReports"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export function useConvexEventSource(eventId: string): EventSource {
  const id = eventId as Id<"events">
  const view: EventView | null | undefined = useQuery(api.events.view, { eventId: id })
  const standings = useQuery(
    api.events.standings,
    view ? { eventId: id, throughRound: standingsThroughRound(view) } : "skip",
  )
  const update = useMutation(api.events.update)
  const addGuest = useMutation(api.events.addGuest)
  const dropPlayer = useMutation(api.events.dropPlayer)
  const undropPlayer = useMutation(api.events.undropPlayer)
  const startNextRound = useMutation(api.events.startNextRound)
  const report = useMutation(api.events.report)
  const confirm = useMutation(api.events.confirm)
  const adjustClock = useMutation(api.events.adjustClock)
  const finish = useMutation(api.events.finish)
  const remove = useMutation(api.events.remove)
  const latency = useMemo(() => new SyncLatency({ transport: "cloud", scope: "event" }), [])
  useLatencyReports(latency)

  const commands = useMemo(() => {
    // why: Convex settles a mutation only once its queries show the change, so the wait is how long this screen took to show it.
    const timed =
      <Args extends unknown[]>(run: (...args: Args) => Promise<void>) =>
      async (...args: Args) => {
        const sentAt = Date.now()
        await run(...args)
        latency.commandShown(sentAt)
      }
    return {
      update: timed(async (patch: Parameters<EventSource["update"]>[0]) => {
        await update({ eventId: id, ...patch })
      }),
      addGuest: timed(async (name: string) => {
        await addGuest({ eventId: id, name })
      }),
      dropPlayer: timed(async (playerId: string) => {
        await dropPlayer({ playerId: playerId as Id<"eventPlayers"> })
      }),
      undropPlayer: timed(async (playerId: string) => {
        await undropPlayer({ playerId: playerId as Id<"eventPlayers"> })
      }),
      startNextRound: timed(async () => {
        await startNextRound({ eventId: id })
      }),
      report: timed(async (tableId: string, result: Parameters<EventSource["report"]>[1]) => {
        await report({ tableId: tableId as Id<"eventTables">, result })
      }),
      confirm: timed(async (tableId: string) => {
        await confirm({ tableId: tableId as Id<"eventTables"> })
      }),
      adjustClock: timed(async (action: Parameters<EventSource["adjustClock"]>[0]) => {
        await adjustClock({ eventId: id, action })
      }),
      finish: timed(async () => {
        await finish({ eventId: id })
      }),
      remove: timed(async () => {
        await remove({ eventId: id })
      }),
    }
  }, [
    latency,
    id,
    update,
    addGuest,
    dropPlayer,
    undropPlayer,
    startNextRound,
    report,
    confirm,
    adjustClock,
    finish,
    remove,
  ])

  return { view, standings: standings ?? undefined, ...commands }
}
