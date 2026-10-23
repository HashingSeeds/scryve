import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { EventScreen } from "@/features/events/EventScreen"
import { startEventMatch } from "@/features/events/startEventMatch"
import { useConvexEventSource } from "@/features/events/useConvexEventSource"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/events"))

function ConvexEvent({ access, eventId }: { access: CloudAccess; eventId: string }) {
  const source = useConvexEventSource(eventId)
  return (
    <EventScreen
      access={access}
      source={source}
      onBack={leave}
      onRemoved={() => router.replace("/events")}
      onStartMatch={(view, table, replace) => startEventMatch(view, table, replace, access.ownerId)}
    />
  )
}

export default function EventRoute() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>()
  if (typeof eventId !== "string") return <Redirect href="/events" />
  return (
    <CloudScreen multiplayer onBack={leave}>
      {(access) => <ConvexEvent access={access} eventId={eventId} />}
    </CloudScreen>
  )
}
