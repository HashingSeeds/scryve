import { useEffect } from "react"
import { useAction } from "convex/react"

import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { useRevenueCat } from "./RevenueCatContext"
import { api } from "../../../convex/_generated/api"

function SyncEntitlements() {
  const profile = useConnectedProfile()
  const { customerInfo, isLoading } = useRevenueCat()
  const syncCurrent = useAction(api.revenuecat.syncCurrent)
  const readyUserId = profile.status === "ready" ? profile.profile.userId : undefined

  useEffect(() => {
    if (!readyUserId || isLoading) return
    void syncCurrent({}).catch((cause: unknown) => {
      reportCrash(
        cause instanceof Error ? cause : new Error("Scryve Pro sync failed"),
        ErrorType.HANDLED,
      )
    })
  }, [customerInfo, isLoading, readyUserId, syncCurrent])

  return null
}

export function RevenueCatSyncSession() {
  return (
    <ConnectedProfileProvider>
      <SyncEntitlements />
    </ConnectedProfileProvider>
  )
}
