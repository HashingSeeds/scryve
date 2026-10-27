import { router } from "expo-router"
import { useQuery } from "convex/react"

import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { EventListScreen } from "@/features/events/EventListScreen"
import { nearbyBetaAvailable } from "@/features/lan/lanAvailability"

import { api } from "../../../convex/_generated/api"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

function EventList({ access }: { access: CloudAccess }) {
  const events = useQuery(api.events.mine, access.ready ? {} : "skip")
  return (
    <EventListScreen
      access={access}
      events={events}
      onBack={leave}
      onNew={() => router.push("/events/new")}
      onJoin={() => router.push("/events/join")}
      onOpen={(eventId) => router.push({ pathname: "/events/[eventId]", params: { eventId } })}
      onNearby={nearbyBetaAvailable() ? () => router.push("/events/nearby") : undefined}
    />
  )
}

export default function EventsRoute() {
  return (
    <CloudScreen multiplayer onBack={leave}>
      {(access) => <EventList access={access} />}
    </CloudScreen>
  )
}
