import { useEffect } from "react"
import { router } from "expo-router"

import { EventScreen } from "@/features/events/EventScreen"
import { nearbyEventHost, useNearbyEventHost } from "@/features/events/nearby/nearbyEventHost"
import { useHostEventSource } from "@/features/events/nearby/useNearbyEventSource"
import { startEventMatch } from "@/features/events/startEventMatch"

const RETRY_MS = 3_000

const leave = () => (router.canGoBack() ? router.back() : router.replace("/events/nearby"))

export default function NearbyHostRoute() {
  const source = useHostEventSource()
  const { status } = useNearbyEventHost()
  // why: the server ends with the app, and the network can drop it, so this screen keeps the event published.
  useEffect(() => {
    if (status !== "idle" && status !== "error") return
    const timer = setTimeout(() => void nearbyEventHost.start(), status === "error" ? RETRY_MS : 0)
    return () => clearTimeout(timer)
  }, [status])
  return (
    <EventScreen
      source={source}
      onBack={leave}
      onRemoved={() => router.replace("/events/nearby")}
      onStartMatch={(view, table, replace) => startEventMatch(view, table, replace, undefined)}
      showStoreScreen={false}
    />
  )
}
