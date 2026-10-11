import { useSyncExternalStore } from "react"
import { Platform } from "react-native"
import { useNetworkState } from "expo-network"
import { useConvexConnectionState } from "convex/react"

const isBrowser = Platform.OS === "web" && typeof window !== "undefined"

function subscribeToBrowserNetwork(onChange: () => void) {
  if (!isBrowser) return () => {}
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

const browserReportsNetwork = () => !isBrowser || navigator.onLine !== false

export function useConvexOnline() {
  const { isWebSocketConnected } = useConvexConnectionState()
  const networkReachable = useSyncExternalStore(
    subscribeToBrowserNetwork,
    browserReportsNetwork,
    () => true,
  )
  // why: a native socket can still read as connected after the network drops, so the device's own signal shows offline at once.
  const { isConnected } = useNetworkState()
  return (
    isWebSocketConnected && networkReachable && (Platform.OS === "web" || isConnected !== false)
  )
}
