import { useEffect, useState } from "react"
import { AppState } from "react-native"
import { router } from "expo-router"
import { useConvexAuth, useMutation } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { useFeedbackKey } from "@/features/feedback/feedbackKey"
import { appLocale } from "@/i18n"
import { storage } from "@/utils/storage"

import { onNotificationOpened, pushSupported, pushToken } from "./device"
import { usePushPref } from "./prefs"
import { api } from "../../../convex/_generated/api"

const REGISTERED = "notifications.registered"

export function PushDeviceSync() {
  const auth = useAuthAccess()
  return pushSupported && auth.configured ? <Sync /> : null
}

function Sync() {
  const key = useFeedbackKey()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const feedbackReplies = usePushPref("feedbackReplies")
  const renewalReminders = usePushPref("renewalReminders")
  const online = useConvexOnline()
  const syncDevice = useMutation(api.notifications.syncDevice)
  const forgetDevice = useMutation(api.notifications.forgetDevice)
  const [foregrounds, setForegrounds] = useState(0)

  useEffect(() => onNotificationOpened((url) => router.push(url)), [])

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state) => state === "active" && setForegrounds((count) => count + 1),
    )
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!key || isLoading || !online) return
    let stale = false
    void (async () => {
      const token = feedbackReplies || renewalReminders ? await pushToken() : null
      if (stale) return
      if (!token) {
        if (!storage.getBoolean(REGISTERED)) return
        await forgetDevice({ key })
        if (!stale) storage.set(REGISTERED, false)
        return
      }
      // why: set before sending, so turning both off while this is in flight still forgets the device.
      storage.set(REGISTERED, true)
      await syncDevice({ key, token, locale: appLocale, feedbackReplies, renewalReminders })
    })().catch(() => undefined)
    return () => {
      stale = true
    }
    // why: signing in or out changes which account this device belongs to, a sync that failed offline must run again once back online, and notifications may have been turned off in system settings while away.
  }, [
    key,
    foregrounds,
    isLoading,
    isAuthenticated,
    online,
    feedbackReplies,
    renewalReminders,
    syncDevice,
    forgetDevice,
  ])

  return null
}
