import { useEffect, useState } from "react"
import { useZeroconf } from "react-native-zeroconf"

import { lanSession } from "./lanSession"
import { checkLocalNetworkAccess, isLanGameService, LAN_SERVICE_TYPE } from "./lanTransport"

export function useNearbyGames(enabled: boolean) {
  // why: Android 17 refuses to browse or publish until the app itself requests ACCESS_LOCAL_NETWORK.
  const [access, setAccess] = useState<Awaited<ReturnType<typeof checkLocalNetworkAccess>>>()
  useEffect(() => {
    checkLocalNetworkAccess().then(setAccess, () => setAccess("denied"))
  }, [])
  const { services } = useZeroconf({
    type: LAN_SERVICE_TYPE,
    protocol: "tcp",
    enabled: enabled && access !== undefined && access !== "denied",
  })
  return {
    denied: access === "denied",
    games: services.filter(
      (service) => isLanGameService(service) && lanSession.isReachable(service.name),
    ),
  }
}
