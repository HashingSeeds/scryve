import {
  useConnectedRuntime,
  useConnectedSession,
  type ConnectedGameRuntime,
} from "@/features/connected/useConnectedRuntime"

import { lanSession, useLanSession } from "./lanSession"

// why: nearby games run the cloud game client against the host instead of Convex, so every system's board works the same either way.
export function useLanGame(): ConnectedGameRuntime {
  const { projection, seatKey, status, role } = useLanSession()
  const session = useConnectedSession({
    publicId: projection?.publicId ?? "nearby",
    ownerId: seatKey ?? "nearby",
    scope: "lan",
    writes: lanSession.writes,
    awaitProjectionBarrier: false,
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
