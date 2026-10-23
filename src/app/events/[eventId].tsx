import { Redirect, router, useLocalSearchParams } from "expo-router"

import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { matchSetupFor } from "@/features/events/eventLogic"
import { EventScreen } from "@/features/events/EventScreen"
import { useConvexEventSource } from "@/features/events/useConvexEventSource"
import { startLocalGame } from "@/features/game/gameSetup"
import { localGameRepository } from "@/features/game/localPersistence"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/events"))

function ConvexEvent({ access, eventId }: { access: CloudAccess; eventId: string }) {
  const source = useConvexEventSource(eventId)
  return (
    <EventScreen
      access={access}
      source={source}
      onBack={leave}
      onRemoved={() => router.replace("/events")}
      onStartMatch={(view, table, replace) => {
        const setup = matchSetupFor(view, table, Date.now())
        const active = localGameRepository.loadActiveGame()
        // why: tapping Start match again for the match already running must resume it, not end it mid-match.
        if (
          active?.match &&
          active.players.map((player) => player.name).join("\n") ===
            setup.players.map((player) => player.name).join("\n")
        ) {
          router.push("/game/current")
          return true
        }
        if (replace) localGameRepository.clearActiveGame()
        const meSeat = view.myPlayerId ? table.playerIds.indexOf(view.myPlayerId) : -1
        return startLocalGame({
          ...setup,
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
