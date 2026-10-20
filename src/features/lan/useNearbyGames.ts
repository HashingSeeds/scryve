import { useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { useZeroconf } from "react-native-zeroconf"

import { lanSession } from "./lanSession"
import { checkLocalNetworkAccess, isLanGameService, LAN_SERVICE_TYPE } from "./lanTransport"

// why: networks that isolate devices look identical to an empty one, so after a short scan the empty list says how to fix it.
const NOT_FOUND_AFTER_MS = 10_000

type LocalNetworkAccess = Awaited<ReturnType<typeof checkLocalNetworkAccess>>

// why: Android 17 refuses to browse or publish until the app itself requests ACCESS_LOCAL_NETWORK, and a player who turns access on in Settings comes back expecting it to work.
export function useLocalNetworkAccess() {
  const [access, setAccess] = useState<LocalNetworkAccess>()
  // why: each check briefly advertises a throwaway service, so only a denied answer is worth asking again.
  const denied = useRef(false)
  denied.current = access === "denied"
  useEffect(() => {
    const check = () => checkLocalNetworkAccess().then(setAccess, () => setAccess("denied"))
    void check()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && denied.current) void check()
    })
    return () => subscription.remove()
  }, [])
  return access
}

export function useNearbyGames(enabled: boolean) {
  const access = useLocalNetworkAccess()
  const scanning = enabled && access !== undefined && access !== "denied"
  const [scannedLong, setScannedLong] = useState(false)
  useEffect(() => {
    setScannedLong(false)
    if (!scanning) return
    const timer = setTimeout(() => setScannedLong(true), NOT_FOUND_AFTER_MS)
    return () => clearTimeout(timer)
  }, [scanning])
  const { services } = useZeroconf({ type: LAN_SERVICE_TYPE, protocol: "tcp", enabled: scanning })
  return {
    access,
    denied: access === "denied",
    scannedLong,
    games: services.filter(
      (service) => isLanGameService(service) && lanSession.isReachable(service.name),
    ),
  }
}
