import { Platform } from "react-native"
import { addNetworkStateListener, type NetworkState } from "expo-network"
import type { ConvexReactClient } from "convex/react"

const reachableNetwork = ({ isConnected, isInternetReachable, type }: NetworkState) =>
  isConnected === true && isInternetReachable !== false ? (type ?? "unknown") : null

// why: Convex skips its reconnect backoff only on the browser `online` event, which React Native never fires, so native apps waited up to ~24 s for the socket after the network returned.
export function reconnectConvexOnNetworkReturn(client: ConvexReactClient) {
  if (Platform.OS === "web") return () => undefined
  // why: starts unknown so the first usable network also retries; a launch while offline may never report offline first.
  let lastNetwork: string | null | undefined
  // why: an attempt already in flight when the network returns makes the nudge a no-op, so if that attempt fails, its backoff is skipped once too.
  let retriesAtNetworkChange: number | null = null
  const subscription = addNetworkStateListener((state) => {
    const network = reachableNetwork(state)
    // why: a new usable network (back from offline, or Wi-Fi taking over from cellular) gets one more try; repeats of the same network keep Convex's backoff.
    if (network && network !== lastNetwork) {
      const { isWebSocketConnected, connectionRetries } = client.connectionState()
      retriesAtNetworkChange = isWebSocketConnected ? null : connectionRetries
      reconnectNow(client)
    }
    lastNetwork = network
  })
  const unsubscribe = client.subscribeToConnectionState(
    ({ isWebSocketConnected, connectionRetries }) => {
      if (retriesAtNetworkChange === null) return
      if (isWebSocketConnected) retriesAtNetworkChange = null
      else if (connectionRetries > retriesAtNetworkChange) {
        retriesAtNetworkChange = null
        reconnectNow(client)
      }
    },
  )
  return () => {
    subscription.remove()
    unsubscribe()
  }
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
