import { Alert, Linking } from "react-native"
import { useMMKVBoolean } from "react-native-mmkv"

import { translate } from "@/i18n/translate"
import { storage } from "@/utils/storage"

import { pushSupported, requestPush } from "./device"

export type PushKind = "feedbackReplies" | "renewalReminders"

const prefKey = (kind: PushKind) => `notifications.${kind}`

export function usePushPref(kind: PushKind) {
  return useMMKVBoolean(prefKey(kind), storage)[0] ?? false
}

export async function setPushPref(kind: PushKind, on: boolean) {
  if (on && !(await requestPush())) {
    Alert.alert(
      translate("account:settings.notifications.blockedTitle"),
      translate("account:settings.notifications.blockedBody"),
      [
        { text: translate("common:cancel"), style: "cancel" },
        {
          text: translate("account:settings.notifications.openSettings"),
          onPress: () => void Linking.openSettings(),
        },
      ],
    )
    return
  }
  storage.set(prefKey(kind), on)
}

const FEEDBACK_REPLIES_OFFERED = "notifications.feedbackRepliesOffered"

// why: asked once, so "Not now" sticks; Settings is the way back. The OS prompt comes only after a yes, since iOS allows it once.
export function offerFeedbackReplies() {
  if (
    !pushSupported ||
    storage.getBoolean(FEEDBACK_REPLIES_OFFERED) ||
    storage.getBoolean(prefKey("feedbackReplies"))
  )
    return
  storage.set(FEEDBACK_REPLIES_OFFERED, true)
  Alert.alert(translate("feedback:notifyPrompt.title"), translate("feedback:notifyPrompt.body"), [
    { text: translate("feedback:notifyPrompt.notNow"), style: "cancel" },
    {
      text: translate("feedback:notifyPrompt.notify"),
      onPress: () => void setPushPref("feedbackReplies", true),
    },
  ])
}

export function offerRenewalReminder() {
  if (!pushSupported || storage.getBoolean(prefKey("renewalReminders"))) return
  Alert.alert(
    translate("account:billing.renewalPrompt.title"),
    translate("account:billing.renewalPrompt.body"),
    [
      { text: translate("account:billing.renewalPrompt.notNow"), style: "cancel" },
      {
        text: translate("account:billing.renewalPrompt.remind"),
        onPress: () => void setPushPref("renewalReminders", true),
      },
    ],
  )
}
