import { v, type Infer } from "convex/values"

import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

const DAY = 24 * 60 * 60 * 1000
// why: stores start charging up to a day before renewal, so the reminder needs room to cancel first.
export const RENEWAL_REMINDER_LEAD_MS = 3 * DAY
export const USER_DEVICES = 20

const LOCALES = ["en", "es", "fr", "hi", "ja", "ko"] as const
type Locale = (typeof LOCALES)[number]

export function notificationLocale(tag: string | undefined): Locale {
  return LOCALES.find((locale) => locale === tag?.split("-")[0]) ?? "en"
}

const RENEWS_SOON: Record<Locale, string> = {
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
  data: v.object({ url: v.string() }),
})
type PushMessage = Infer<typeof pushMessage>

// why: must match the category the app registers, or iOS hides previews behind its generic placeholder.
export const FEEDBACK_REPLY_CATEGORY = "feedback_reply"
// why: APNs drops payloads over 4 KB, and a full 2,000-character reply can pass that.
const PREVIEW_LENGTH = 180

async function sendPush(ctx: MutationCtx, messages: PushMessage[]) {
  if (messages.length) await ctx.scheduler.runAfter(0, internal.notifications.send, { messages })
}

export async function notifyFeedbackReply(
  ctx: MutationCtx,
  request: Doc<"feedbackRequests">,
  reply: string,
) {
  const fromInstall = await ctx.db
    .query("pushDevices")
    .withIndex("by_sender_hash", (q) => q.eq("senderHash", request.senderHash))
    .take(1)
  const userId = request.userId
  const fromAccount = userId
    ? await ctx.db
        .query("pushDevices")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .take(USER_DEVICES)
    : []
  const devices = new Map([...fromInstall, ...fromAccount].map((device) => [device._id, device]))
  const body = reply.length > PREVIEW_LENGTH ? `${reply.slice(0, PREVIEW_LENGTH - 1)}…` : reply
  await sendPush(
    ctx,
    [...devices.values()]
      .filter((device) => device.feedbackReplies)
      .map((device) => ({
        to: device.token,
        body,
        categoryId: FEEDBACK_REPLY_CATEGORY,
        data: { url: `/feedback/${request._id}` },
      })),
  )
}

export async function notifyRenewal(ctx: MutationCtx, userId: Id<"users">, foil: boolean) {
  const devices = await ctx.db
    .query("pushDevices")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .take(USER_DEVICES)
  await sendPush(
    ctx,
    devices
      .filter((device) => device.renewalReminders)
      .map((device) => ({
        to: device.token,
        title: foil ? "Scryve Foil" : "Scryve Pro",
        body: RENEWS_SOON[notificationLocale(device.locale)],
        data: { url: "/account" },
      })),
  )
}

export async function forgetAccountDevices(ctx: MutationCtx, userId: Id<"users">) {
  const devices = await ctx.db
    .query("pushDevices")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .take(USER_DEVICES)
  for (const device of devices) await ctx.db.delete(device._id)
  return devices.length
}
