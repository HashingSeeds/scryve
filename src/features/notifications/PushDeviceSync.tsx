import { useEffect } from "react"
import { Platform } from "react-native"
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

  useEffect(() => onNotificationOpened((url) => router.push(url)), [])

  useEffect(() => {
    if (!key || isLoading || !online) return
    if (!feedbackReplies && !renewalReminders) {
      if (storage.getBoolean(REGISTERED))
        void forgetDevice({ key }).then(
          () => storage.set(REGISTERED, false),
          () => undefined,
        )
      return
    }
    void (async () => {
      const token = await pushToken()
      if (!token) return
      await syncDevice({
        key,
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        locale: appLocale,
        feedbackReplies,
        renewalReminders,
      })
      storage.set(REGISTERED, true)
    })().catch(() => undefined)
    // why: signing in or out changes which account this device belongs to, and a sync that failed offline must run again once back online.
  }, [
    key,
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
