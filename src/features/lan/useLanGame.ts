import { useMemo } from "react"

import type { ConnectedGameRuntime } from "@/features/connected/useConnectedGame"
import { playTableRules } from "@/features/game/playSystems"
import { createTableActions } from "@/features/game/tableRuntime"

import { lanProjection } from "./lanGame"
import { lanSession, useLanSession } from "./lanSession"
import { EMPTY_TABLE } from "../../../convex/lib/table"

const noop = () => {}
// why: LAN play is life totals only, so table actions read no source and never submit.
const NO_TABLE_ACTIONS = createTableActions(
  () => null,
  () => false,
)

export function useLanGame(): ConnectedGameRuntime {
  const { game, status } = useLanSession()
  const projection = useMemo(() => (game ? lanProjection(game, lanSession.playerId) : null), [game])
  return useMemo((): ConnectedGameRuntime => {
    const base = {
      ...NO_TABLE_ACTIONS,
      table: EMPTY_TABLE,
      tableRules: playTableRules("mtg"),
      pending: [],
      failed: [],
      connectionStatus: status === "connected" ? ("connected" as const) : ("offline" as const),
      changeLife: (playerId: string, delta: number) => lanSession.changeLife(playerId, delta),
      submitCommanderDamage: noop,
      resolveCommanderDamageClaim: noop,
      finish: async () => {
        lanSession.finish()
        return true
      },
      abandon: async () => {
        lanSession.leave()
        return true
      },
      dismissFailed: noop,
      finishing: false,
    }
    return projection
      ? { ...base, status: "ready", source: "remote", projection }
      : { ...base, status: "loading", projection: null }
  }, [projection, status])
}
