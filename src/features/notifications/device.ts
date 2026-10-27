import { Platform } from "react-native"
import Constants from "expo-constants"
import * as Notifications from "expo-notifications"

import { translate } from "@/i18n/translate"

import { FEEDBACK_REPLY_CATEGORY } from "../../../convex/lib/notifications"

export const pushSupported = true

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

// why: Android 13 shows no permission prompt until a channel exists, and iOS needs the category for its hidden-preview text.
async function prepare() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: translate("account:settings.notifications.channel"),
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  else
    await Notifications.setNotificationCategoryAsync(FEEDBACK_REPLY_CATEGORY, [], {
      previewPlaceholder: translate("account:settings.notifications.feedbackReplyPreview"),
    })
}

export async function requestPush() {
  await prepare()
  const current = await Notifications.getPermissionsAsync()
  if (current.granted || !current.canAskAgain) return current.granted
  return (await Notifications.requestPermissionsAsync()).granted
}

export async function pushToken() {
  if (!(await Notifications.getPermissionsAsync()).granted) return null
  await prepare()
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId
  const token = await Notifications.getExpoPushTokenAsync(
    typeof projectId === "string" ? { projectId } : {},
  )
  return token.data
}

export function onNotificationOpened(open: (url: string) => void) {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url
    if (typeof url !== "string" || !url.startsWith("/")) return
    Notifications.clearLastNotificationResponse()
    open(url)
  }
  handle(Notifications.getLastNotificationResponse())
  const subscription = Notifications.addNotificationResponseReceivedListener(handle)
  return () => subscription.remove()
}
