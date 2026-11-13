import { useMemo } from "react"

import {
  useConnectedRuntime,
  useConnectedSession,
  type ConnectedGameRuntime,
} from "@/features/connected/useConnectedRuntime"

import { hostTableRules } from "./lanGame"
import { lanSession, useLanSession } from "./lanSession"

export function useLanGame(): ConnectedGameRuntime {
  const { projection, seatKey, status, role, hostTableItems } = useLanSession()
  const session = useConnectedSession({
    publicId: projection?.publicId ?? "nearby",
    ownerId: seatKey ?? "nearby",
    scope: "lan",
    writes: lanSession.writes,
    awaitProjectionBarrier: false,
    latency: lanSession.latency,
  })
  const reachable = role === "host" || status === "connected"
  const runtime = useConnectedRuntime(session, {
    remote: projection,
    environment: {
      isAuthenticated: true,
      isLoading: false,
      isRefreshing: false,
      isWebSocketConnected: reachable,
      remoteReady: reachable && Boolean(projection),
    },
  })
  return useMemo(() => {
    if (role !== "guest") return runtime
    const tableRules = hostTableRules(runtime.tableRules, hostTableItems)
    return tableRules === runtime.tableRules ? runtime : { ...runtime, tableRules }
  }, [runtime, role, hostTableItems])
}
