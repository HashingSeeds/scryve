import { useZeroconf } from "react-native-zeroconf"

import { LAN_SERVICE_TYPE } from "@/features/lan/lanTransport"
import { useLocalNetworkAccess } from "@/features/lan/useNearbyGames"

import { isNearbyEventService } from "./nearbyEventProtocol"

export function useNearbyEvents(ownService: string | null) {
  const access = useLocalNetworkAccess()
  const scanning = access !== undefined && access !== "denied"
  const { services } = useZeroconf({ type: LAN_SERVICE_TYPE, protocol: "tcp", enabled: scanning })
  return {
    denied: access === "denied",
    events: services.filter(
      (service) => isNearbyEventService(service.name) && service.name !== ownService,
    ),
  }
}
