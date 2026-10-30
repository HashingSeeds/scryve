import { useMemo } from "react"

import type { HubCommand } from "./hubEvent"
import { hubStandings, hubView } from "./hubEvent"
import { nearbyEventClient, useNearbyEventClient } from "./nearbyEventClient"
import { nearbyEventHost, useNearbyEventHost } from "./nearbyEventHost"
import { standingsThroughRound } from "../../../../convex/lib/events/commands"
import type { EventSource } from "../eventSource"
import { useLatencyReports } from "../useLatencyReports"

type Commands = Omit<EventSource, "view" | "standings">

function commandsFor(
  run: (command: HubCommand) => Promise<void>,
  remove: () => Promise<void>,
): Commands {
  return {
    update: (patch) => run({ kind: "update", patch }),
    addGuest: (name) => run({ kind: "addGuest", name }),
    dropPlayer: (playerId) => run({ kind: "drop", playerId }),
    undropPlayer: (playerId) => run({ kind: "undrop", playerId }),
    startNextRound: () => run({ kind: "startRound" }),
    report: (tableId, result) => run({ kind: "report", tableId, result }),
    confirm: (tableId) => run({ kind: "confirm", tableId }),
    adjustClock: (action) => run({ kind: "clock", action }),
    finish: () => run({ kind: "finish" }),
    remove,
  }
}

const hostCommands = commandsFor(
  async (command) => nearbyEventHost.run(command),
  () => nearbyEventHost.discard(),
)
const clientCommands = commandsFor(
  (command) => nearbyEventClient.run(command),
  () => Promise.reject(new Error("Only the organizer can delete an event")),
)

export function useHostEventSource(): EventSource {
  const { event, hostPlayerId } = useNearbyEventHost()
  return useMemo(() => {
    if (!event) return { ...hostCommands, view: null, standings: undefined }
    const view = hubView(event, { organizer: true, playerId: hostPlayerId })
    return { ...hostCommands, view, standings: hubStandings(event, standingsThroughRound(view)) }
  }, [event, hostPlayerId])
}

export function useClientEventSource(): EventSource {
  const { view, standings, status } = useNearbyEventClient()
  useLatencyReports(nearbyEventClient.latency)
  return useMemo(
    () => ({
      ...clientCommands,
      view: view ?? (status === "rejected" ? null : undefined),
      standings,
    }),
    [view, standings, status],
  )
}
