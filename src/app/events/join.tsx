import { router, useLocalSearchParams } from "expo-router"
import { useMutation } from "convex/react"

import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { JoinEventScreen } from "@/features/events/JoinEventScreen"

import { api } from "../../../convex/_generated/api"

function JoinEvent({ access, code }: { access: CloudAccess; code?: string }) {
  const join = useMutation(api.events.join)
  return (
    <JoinEventScreen
      access={access}
      initialCode={code}
      onBack={() => router.back()}
      onJoin={async (value) => {
        const joined = await join({ code: value })
        if (!joined) return "notFound"
        router.replace({ pathname: "/events/[eventId]", params: { eventId: joined.eventId } })
        return "joined"
      }}
    />
  )
}

export default function JoinEventRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  return (
    <CloudScreen multiplayer onBack={() => router.back()}>
      {(access) => <JoinEvent access={access} code={code} />}
    </CloudScreen>
  )
}
