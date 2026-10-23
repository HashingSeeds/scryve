import { Redirect, router } from "expo-router"

import { EventScreen } from "@/features/events/EventScreen"
import { nearbyEventClient, useNearbyEventClient } from "@/features/events/nearby/nearbyEventClient"
import { useClientEventSource } from "@/features/events/nearby/useNearbyEventSource"
import { startEventMatch } from "@/features/events/startEventMatch"
import { translate } from "@/i18n/translate"

const leave = () => {
  nearbyEventClient.leave()
  if (router.canGoBack()) router.back()
  else router.replace("/events/nearby")
}

export default function NearbyEventRoute() {
  const source = useClientEventSource()
  const { status } = useNearbyEventClient()
  // why: the connection lives in memory, so after a restart the player picks the event again.
  if (status === "idle") return <Redirect href="/events/nearby" />
  return (
    <EventScreen
      source={source}
      onBack={leave}
      onRemoved={leave}
      onStartMatch={(view, table, replace) => startEventMatch(view, table, replace, undefined)}
      showStoreScreen={false}
      notice={status === "lost" ? translate("events:nearby.reconnecting") : undefined}
    />
  )
}
