import { useEffect, useRef } from "react"
import { useAction } from "convex/react"

import {
  ConnectedProfileProvider,
  useConnectedProfile,
} from "@/features/connected/useConnectedProfile"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { useRevenueCat } from "./RevenueCatContext"
import { api } from "../../../convex/_generated/api"

const retryDelay = (attempt: number) => Math.min(1_000 * 2 ** Math.min(attempt, 5), 30_000)

function SyncEntitlements() {
  const profile = useConnectedProfile()
  const { customerInfo, isLoading, refreshCustomerInfo } = useRevenueCat()
  const syncCurrent = useAction(api.revenuecat.syncCurrent)
  const readyUserId = profile.status === "ready" ? profile.profile.userId : undefined
  const wasOffline = useRef(false)

  useEffect(() => {
    if (profile.status === "offline") wasOffline.current = true
    if (!readyUserId || isLoading || !wasOffline.current) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempt = 0
    const refresh = async () => {
      const info = await refreshCustomerInfo(true).catch(() => null)
      if (cancelled) return
      if (info) wasOffline.current = false
      else timer = setTimeout(refresh, retryDelay(attempt++))
    }
    void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [profile.status, isLoading, readyUserId, refreshCustomerInfo])

  useEffect(() => {
    if (!readyUserId || isLoading) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempt = 0
    const sync = async () => {
      try {
        await syncCurrent({})
      } catch (cause) {
        if (cancelled) return
        if (attempt === 0) {
          reportCrash(
            cause instanceof Error ? cause : new Error("Scryve Pro sync failed"),
            ErrorType.HANDLED,
          )
        }
        timer = setTimeout(sync, retryDelay(attempt++))
      }
    }
    void sync()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
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
