import { v, type Infer } from "convex/values"

import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

const DAY = 24 * 60 * 60 * 1000
// why: stores start charging up to a day before renewal, so the reminder needs room to cancel first.
export const RENEWAL_REMINDER_LEAD_MS = 3 * DAY

export function renewalReminderTime(renewsAt: number | undefined) {
  return renewsAt === undefined ? undefined : renewsAt - RENEWAL_REMINDER_LEAD_MS
}

export const USER_DEVICES = 20
const EXPO_BATCH = 100

export const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[\w-]{1,200}\]$/

export const NOTIFICATION_LOCALES = ["en", "es", "fr", "hi", "ja", "ko"] as const
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number]

export function notificationLocale(tag: string | undefined): NotificationLocale {
  const language = tag?.split("-")[0]
  return NOTIFICATION_LOCALES.find((locale) => locale === language) ?? "en"
}

const RENEWS_SOON: Record<NotificationLocale, string> = {
  en: "Renews in 3 days.",
  es: "Se renueva en 3 días.",
  fr: "Renouvellement dans 3 jours.",
  hi: "3 दिनों में रिन्यू होगा।",
  ja: "3日後に更新されます。",
  ko: "3일 후에 갱신됩니다.",
}

export const pushMessage = v.object({
  to: v.string(),
  title: v.optional(v.string()),
  body: v.string(),
  categoryId: v.optional(v.string()),
  url: v.string(),
})
export type PushMessage = Infer<typeof pushMessage>

// why: must match the category the app registers, or iOS hides previews behind its generic placeholder.
export const FEEDBACK_REPLY_CATEGORY = "feedback_reply"
const FEEDBACK_PREVIEW_LENGTH = 180

export function feedbackReplyMessage(
  device: Doc<"pushDevices">,
  requestId: string,
  reply: string,
): PushMessage {
  return {
    to: device.token,
    body:
      reply.length > FEEDBACK_PREVIEW_LENGTH
        ? `${reply.slice(0, FEEDBACK_PREVIEW_LENGTH - 1)}…`
        : reply,
    categoryId: FEEDBACK_REPLY_CATEGORY,
    url: `/feedback/${requestId}`,
  }
}

export function renewalReminderMessage(device: Doc<"pushDevices">, foil: boolean): PushMessage {
  return {
    to: device.token,
    title: foil ? "Scryve Foil" : "Scryve Pro",
    body: RENEWS_SOON[notificationLocale(device.locale)],
    url: "/account",
  }
}

export function uniqueByToken(devices: Doc<"pushDevices">[]) {
  return [...new Map(devices.map((device) => [device.token, device])).values()]
}

export async function sendPush(ctx: MutationCtx, messages: PushMessage[]) {
  for (let start = 0; start < messages.length; start += EXPO_BATCH)
    await ctx.scheduler.runAfter(0, internal.notifications.send, {
      messages: messages.slice(start, start + EXPO_BATCH),
    })
}

export async function feedbackReplyDevices(ctx: MutationCtx, request: Doc<"feedbackRequests">) {
  const fromInstall = await ctx.db
    .query("pushDevices")
    .withIndex("by_sender", (q) => q.eq("senderHash", request.senderHash))
    .take(1)
  const userId = request.userId
  const fromAccount = userId
    ? await ctx.db
        .query("pushDevices")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(USER_DEVICES)
    : []
  return uniqueByToken([...fromInstall, ...fromAccount].filter((device) => device.feedbackReplies))
}

export async function forgetAccountDevices(ctx: MutationCtx, userId: Id<"users">) {
  const devices = await ctx.db
    .query("pushDevices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(USER_DEVICES)
  for (const device of devices) {
    if (device.feedbackReplies)
      await ctx.db.patch(device._id, { userId: undefined, renewalReminders: false })
    else await ctx.db.delete(device._id)
  }
  return devices.length
}
