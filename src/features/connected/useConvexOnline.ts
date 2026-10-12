import { useNetworkState } from "expo-network"
import { useConvexConnectionState } from "convex/react"

export function useConvexOnline() {
  const { isWebSocketConnected } = useConvexConnectionState()
  // why: a native socket can still read as connected after the network drops, so the device's own signal shows offline at once.
  const { isConnected } = useNetworkState()
  return isWebSocketConnected && isConnected !== false
}
