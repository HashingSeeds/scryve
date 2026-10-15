import { useMemo } from "react"

import type {
  ConnectedCommanderDamageChange,
  ConnectedCommanderDamageClaim,
} from "@/features/connected/model"
import type { ConnectedGameRuntime } from "@/features/connected/useConnectedGame"
import { NO_PLAY_SYSTEM, playTableRules } from "@/features/game/playSystems"
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
  const { game, status, seatKey } = useLanSession()
  const projection = useMemo(
    () => (game && seatKey ? lanProjection(game, seatKey) : null),
    [game, seatKey],
  )
  return useMemo((): ConnectedGameRuntime => {
    const base = {
      ...NO_TABLE_ACTIONS,
      table: EMPTY_TABLE,
      tableRules: playTableRules(NO_PLAY_SYSTEM),
      pending: [],
      failed: [],
      connectionStatus: status === "connected" ? ("connected" as const) : ("offline" as const),
      changeLife: (seatKey: string, delta: number) => lanSession.changeLife(seatKey, delta),
      submitCommanderDamage: (
        fromPlayerId: string,
        changes: readonly ConnectedCommanderDamageChange[],
      ) => lanSession.claimCommanderDamage(fromPlayerId, changes),
      resolveCommanderDamageClaim: (claim: ConnectedCommanderDamageClaim, accepted: boolean) =>
        lanSession.resolveCommanderDamage(claim.claimId, accepted),
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
