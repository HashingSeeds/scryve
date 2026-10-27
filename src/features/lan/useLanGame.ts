import {
  useConnectedRuntime,
  useConnectedSession,
  type ConnectedGameRuntime,
} from "@/features/connected/useConnectedRuntime"

import { lanSession, useLanSession } from "./lanSession"

export function useLanGame(): ConnectedGameRuntime {
  const { projection, seatKey, status, role } = useLanSession()
  const session = useConnectedSession({
    publicId: projection?.publicId ?? "nearby",
    ownerId: seatKey ?? "nearby",
    scope: "lan",
    writes: lanSession.writes,
    awaitProjectionBarrier: false,
    latency: lanSession.latency,
  })
  const reachable = role === "host" || status === "connected"
  return useConnectedRuntime(session, {
    remote: projection,
    environment: {
      isAuthenticated: true,
      isLoading: false,
      isRefreshing: false,
      isWebSocketConnected: reachable,
      remoteReady: reachable && Boolean(projection),
    },
  })
}
