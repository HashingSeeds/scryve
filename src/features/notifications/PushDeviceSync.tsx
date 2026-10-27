import { useEffect } from "react"
import { Platform } from "react-native"
import { router } from "expo-router"
import { useConvexAuth, useMutation } from "convex/react"

import { useAuthAccess } from "@/features/auth/AuthContext"
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
  const syncDevice = useMutation(api.notifications.syncDevice)

  useEffect(() => onNotificationOpened((url) => router.push(url)), [])

  useEffect(() => {
    const wanted = feedbackReplies || renewalReminders
    if (!key || isLoading || (!wanted && !storage.getBoolean(REGISTERED))) return
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
      storage.set(REGISTERED, wanted)
    })().catch(() => undefined)
    // why: signing in or out changes which account this device belongs to, so it re-syncs.
  }, [key, isLoading, isAuthenticated, feedbackReplies, renewalReminders, syncDevice])

  return null
}
