import { useMemo } from "react"
import { useMutation, useQuery } from "convex/react"

import { standingsThroughRound } from "./eventLogic"
import type { EventSource, EventView } from "./eventSource"
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

  const commands = useMemo(
    () => ({
      update: async (patch: Parameters<EventSource["update"]>[0]) => {
        await update({ eventId: id, ...patch })
      },
      addGuest: async (name: string) => {
        await addGuest({ eventId: id, name })
      },
      dropPlayer: async (playerId: string) => {
        await dropPlayer({ playerId: playerId as Id<"eventPlayers"> })
      },
      undropPlayer: async (playerId: string) => {
        await undropPlayer({ playerId: playerId as Id<"eventPlayers"> })
      },
      startNextRound: async () => {
        await startNextRound({ eventId: id })
      },
      report: async (tableId: string, result: Parameters<EventSource["report"]>[1]) => {
        await report({ tableId: tableId as Id<"eventTables">, result })
      },
      confirm: async (tableId: string) => {
        await confirm({ tableId: tableId as Id<"eventTables"> })
      },
      adjustClock: async (action: Parameters<EventSource["adjustClock"]>[0]) => {
        await adjustClock({ eventId: id, action })
      },
      finish: async () => {
        await finish({ eventId: id })
      },
      remove: async () => {
        await remove({ eventId: id })
      },
    }),
    [
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
    ],
  )

  return { view, standings: standings ?? undefined, ...commands }
}
