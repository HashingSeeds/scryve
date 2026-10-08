import { Redirect, router, useLocalSearchParams } from "expo-router"
import { useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remoteValue } from "@/features/async/remoteState"
import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { ManualMatchScreen } from "@/screens/ManualMatchScreen"

import { api } from "../../../../convex/_generated/api"

function ManualMatchDetail({
  access,
  publicId,
  onBack,
}: {
  access: CloudAccess
  publicId: string
  onBack: () => void
}) {
  const match = useQuery(api.history.manualMatch, access.ready ? { publicId } : "skip")
  return (
    <ManualMatchScreen
      access={access}
      match={remoteValue(match)}
      onBack={onBack}
      onDeleted={onBack}
    />
  )
}

export default function ManualMatchRoute() {
  const { publicId } = useLocalSearchParams<{ publicId?: string }>()
  const onBack = () => (router.canGoBack() ? router.back() : router.replace("/history"))
  if (typeof publicId !== "string") return <Redirect href="/history" />
  // why: the result was saved through the username-free CloudScreen, so viewing it must not gate on one.
  return (
    <CloudScreen onBack={onBack}>
      {(access) => (
        <ConvexQueryBoundary
          resetKey={publicId}
          fallback={({ retry }) => (
            <ManualMatchScreen
              access={access}
              match={{ status: "unavailable", retry }}
              onBack={onBack}
              onDeleted={onBack}
            />
          )}
        >
          <ManualMatchDetail access={access} publicId={publicId} onBack={onBack} />
        </ConvexQueryBoundary>
      )}
    </CloudScreen>
  )
}
