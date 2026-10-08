import { Redirect, router, useLocalSearchParams } from "expo-router"
import { useConvexAuth, useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remoteValue } from "@/features/async/remoteState"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ManualMatchScreen } from "@/screens/ManualMatchScreen"

import { api } from "../../../../convex/_generated/api"

function ManualMatchDetail({ publicId, onBack }: { publicId: string; onBack: () => void }) {
  const { isAuthenticated } = useConvexAuth()
  const match = useQuery(api.history.manualMatch, isAuthenticated ? { publicId } : "skip")
  return <ManualMatchScreen match={remoteValue(match)} onBack={onBack} onDeleted={onBack} />
}

export default function ManualMatchRoute() {
  const { publicId } = useLocalSearchParams<{ publicId?: string }>()
  const onBack = () => (router.canGoBack() ? router.back() : router.replace("/history"))
  if (typeof publicId !== "string") return <Redirect href="/history" />
  return (
    <ConnectedGate onBack={onBack}>
      <ConvexQueryBoundary
        resetKey={publicId}
        fallback={({ retry }) => (
          <ManualMatchScreen
            match={{ status: "unavailable", retry }}
            onBack={onBack}
            onDeleted={onBack}
          />
        )}
      >
        <ManualMatchDetail publicId={publicId} onBack={onBack} />
      </ConvexQueryBoundary>
    </ConnectedGate>
  )
}
