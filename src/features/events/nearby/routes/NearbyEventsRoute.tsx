import { useState } from "react"
import { router } from "expo-router"

import { eventStatusText } from "@/features/events/eventLogic"
import { nearbyEventClient } from "@/features/events/nearby/nearbyEventClient"
import { useNearbyEventHost } from "@/features/events/nearby/nearbyEventHost"
import {
  nearbyEventCode,
  nearbyEventServiceName,
} from "@/features/events/nearby/nearbyEventProtocol"
import { NearbyEventsScreen } from "@/features/events/nearby/NearbyEventsScreen"
import { useNearbyEvents } from "@/features/events/nearby/useNearbyEvents"
import { useNearbyImport } from "@/features/events/nearby/useNearbyImport"
import { loadLanName, saveLanName } from "@/features/lan/lanAvailability"

const leave = () => (router.canGoBack() ? router.back() : router.replace("/"))

export default function NearbyEventsRoute() {
  const { event, importedFor } = useNearbyEventHost()
  useNearbyImport()
  const { events, denied } = useNearbyEvents(
    event ? nearbyEventServiceName(event.code, event.name) : null,
  )
  const [name, setName] = useState(loadLanName)
  return (
    <NearbyEventsScreen
      hosted={
        event
          ? {
              name: event.name,
              detail: eventStatusText(event),
              running: event.status !== "finished",
              unsaved: event.status === "finished" && importedFor === null,
            }
          : null
      }
      events={events}
      denied={denied}
      name={name}
      askName
      onNameChange={setName}
      onBack={leave}
      onHost={() => router.push("/events/nearby/new")}
      onOpenHosted={() => router.push("/events/nearby/host")}
      onJoin={async (service) => {
        const playerName = name.trim()
        saveLanName(playerName)
        const code = nearbyEventCode(service.name)
        const outcome = await nearbyEventClient.join(service, code, playerName)
        if (outcome === "joined")
          router.push({ pathname: "/events/nearby/[code]", params: { code } })
        return outcome
      }}
    />
  )
}
