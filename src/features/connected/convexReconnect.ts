import { Platform } from "react-native"
import { addNetworkStateListener, type NetworkState } from "expo-network"
import type { ConvexReactClient } from "convex/react"

const reachable = ({ isConnected, isInternetReachable }: NetworkState) =>
  isConnected === true && isInternetReachable !== false

// why: Convex skips its reconnect backoff only on the browser `online` event, which React Native never fires, so native apps waited up to ~24 s for the socket after the network returned.
export function reconnectConvexOnNetworkReturn(client: ConvexReactClient) {
  if (Platform.OS === "web") return () => undefined
  let wasReachable = true
  const subscription = addNetworkStateListener((state) => {
    const isReachable = reachable(state)
    if (isReachable && !wasReachable) reconnectNow(client)
    wasReachable = isReachable
  })
  return () => subscription.remove()
}

// why: convex 1.42 keeps tryReconnectImmediately private behind the internal `sync` client. The runtime checks leave a Convex upgrade that moves it on normal backoff, and convexReconnect.test.ts fails on that upgrade.
function reconnectNow(client: ConvexReactClient) {
  const sync = "sync" in client ? client.sync : undefined
  const manager =
    typeof sync === "object" && sync !== null && "webSocketManager" in sync
      ? sync.webSocketManager
      : undefined
  if (
    typeof manager === "object" &&
    manager !== null &&
    "tryReconnectImmediately" in manager &&
    typeof manager.tryReconnectImmediately === "function"
  )
    manager.tryReconnectImmediately()
}
