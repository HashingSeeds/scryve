import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { matchSetupFor } from "@/features/events/eventLogic"
import { EventScreen } from "@/features/events/EventScreen"
import { useConvexEventSource } from "@/features/events/useConvexEventSource"
import { startLocalGame } from "@/features/game/gameSetup"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/events"))

function ConvexEvent({ access, eventId }: { access: CloudAccess; eventId: string }) {
  const source = useConvexEventSource(eventId)
  return (
    <EventScreen
      access={access}
      source={source}
      onBack={leave}
      onRemoved={() => router.replace("/events")}
      onStartMatch={(view, table) => {
        const meSeat = view.myPlayerId ? table.playerIds.indexOf(view.myPlayerId) : -1
        return startLocalGame({
          ...matchSetupFor(view, table, Date.now()),
          ...(access.ownerId && meSeat >= 0
            ? { account: { ownerId: access.ownerId, meSeat } }
            : {}),
        })
      }}
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
