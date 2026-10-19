import { useEffect, useState } from "react"
import { useZeroconf } from "react-native-zeroconf"

import { lanSession } from "./lanSession"
import { checkLocalNetworkAccess, isLanGameService, LAN_SERVICE_TYPE } from "./lanTransport"

// why: networks that isolate devices look identical to an empty one, so after a short scan the empty list says how to fix it.
const NOT_FOUND_AFTER_MS = 10_000

export function useNearbyGames(enabled: boolean) {
  // why: Android 17 refuses to browse or publish until the app itself requests ACCESS_LOCAL_NETWORK.
  const [access, setAccess] = useState<Awaited<ReturnType<typeof checkLocalNetworkAccess>>>()
  useEffect(() => {
    checkLocalNetworkAccess().then(setAccess, () => setAccess("denied"))
  }, [])
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
    denied: access === "denied",
    scannedLong,
    games: services.filter(
      (service) => isLanGameService(service) && lanSession.isReachable(service.name),
    ),
  }
}
