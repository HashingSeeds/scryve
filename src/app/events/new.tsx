import { router } from "expo-router"
import { useMutation } from "convex/react"

import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { createLobbyIdentifiers } from "@/features/connected/identifiers"
import { NewEventScreen } from "@/features/events/NewEventScreen"

import { api } from "../../../convex/_generated/api"

function NewEvent({ access }: { access: CloudAccess }) {
  const create = useMutation(api.events.create)
  return (
    <NewEventScreen
      access={access}
      onBack={() => router.back()}
      onCreate={async (input) => {
        const { manualCodeCandidates } = await createLobbyIdentifiers()
        const { eventId } = await create({ ...input, codeCandidates: manualCodeCandidates })
        router.replace({ pathname: "/events/[eventId]", params: { eventId } })
      }}
    />
  )
}

export default function NewEventRoute() {
  return (
    <CloudScreen multiplayer onBack={() => router.back()}>
      {(access) => <NewEvent access={access} />}
    </CloudScreen>
  )
}
