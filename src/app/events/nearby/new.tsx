import { router } from "expo-router"

import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { createHubEvent } from "@/features/events/nearby/hubEvent"
import { NEARBY_ACCESS } from "@/features/events/nearby/nearbyAccess"
import { nearbyEventHost } from "@/features/events/nearby/nearbyEventHost"
import { NewEventScreen } from "@/features/events/NewEventScreen"
import { createClientId } from "@/features/game/domain"
import { loadLanName } from "@/features/lan/lanAvailability"
import { translate } from "@/i18n/translate"

import { normalizeManualCode } from "../../../../convex/lib/policy"

export default function NewNearbyEventRoute() {
  return (
    <NewEventScreen
      access={NEARBY_ACCESS}
      onBack={() => router.back()}
      onCreate={async (input) => {
        const { manualCodeCandidates } = await createLobbyIdentifiers()
        const now = Date.now()
        const event = createHubEvent(
          {
            ...input,
            id: createClientId("event", now),
            code: normalizeManualCode(manualCodeCandidates[0]!),
          },
          now,
        )
        const organizerName = loadLanName() || translate("events:organizer")
        await nearbyEventHost.create(event, input.joinAsPlayer ? { name: organizerName } : null)
        router.replace("/events/nearby/host")
      }}
    />
  )
}
