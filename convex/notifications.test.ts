import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import { forgetAccountDevices, RENEWAL_REMINDER_LEAD_MS } from "./lib/notifications"

const ME = "a".repeat(64)
const LAPTOP = "c".repeat(64)
const DAY = 24 * 60 * 60 * 1000

function token(name: string) {
  return `ExponentPushToken[${name}]`
}

function device(
  t: Pick<ConvexTestHarness, "mutation">,
  key: string,
  name: string,
  prefs: { feedbackReplies?: boolean; renewalReminders?: boolean } = {},
) {
  return t.mutation(api.notifications.syncDevice, {
    key,
    token: token(name),
    platform: "ios",
    locale: "ja-JP",
    feedbackReplies: prefs.feedbackReplies ?? false,
    renewalReminders: prefs.renewalReminders ?? false,
  })
}

async function signedIn(t: ConvexTestHarness, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

function expo(tickets: Record<string, unknown> = {}) {
  const sent: Record<string, unknown>[] = []
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (!String(input).endsWith("/push/send")) return Response.json({ data: {} })
    const messages = JSON.parse(String(init?.body)) as { to: string }[]
    sent.push(...messages)
    return Response.json({
      data: messages.map(({ to }, i) => tickets[to] ?? { status: "ok", id: `ticket-${i}` }),
    })
  })
  return sent
}

async function devices(t: ConvexTestHarness) {
  return await t.run((ctx) => ctx.db.query("pushDevices").collect())
}

describe("push notifications", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("tells every device that asked when the team replies, once per device", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "clerk_ana")
    const requestId = await ana.mutation(api.feedback.submit, {
      key: ME,
      kind: "feature",
      body: "Sync timers",
      includeAccount: true,
    })
    await device(ana, ME, "phone", { feedbackReplies: true })
    await device(ana, LAPTOP, "tablet", { feedbackReplies: true })
    await device(t, "d".repeat(64), "stranger", { feedbackReplies: true })
    const sent = expo()

    await t.mutation(internal.feedback.applyApolloEvent, {
      event: { seq: 1, key: `scryve:${requestId}`, actionId: "reply", text: "Shipping next week." },
    })
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())

    expect(sent).toEqual([
      expect.objectContaining({
        to: token("phone"),
        body: "Shipping next week.",
        categoryId: "feedback_reply",
        data: { url: `/feedback/${requestId}` },
      }),
      expect.objectContaining({ to: token("tablet") }),
    ])
    expect(sent[0]).not.toHaveProperty("title")
  })

  it("keeps renewal reminders for signed-in devices and forgets a device without its token", async () => {
    const t = makeConvexTest()
    await device(t, ME, "phone", { feedbackReplies: true, renewalReminders: true })
    expect(await devices(t)).toMatchObject([
      { feedbackReplies: true, renewalReminders: false, locale: "ja" },
    ])

    await t.mutation(api.notifications.forgetDevice, { key: ME })
    expect(await devices(t)).toEqual([])
    await expect(
      t.mutation(api.notifications.syncDevice, {
        key: ME,
        token: "not-a-token",
        platform: "ios",
        feedbackReplies: true,
        renewalReminders: false,
      }),
    ).rejects.toThrow("Invalid push token")
  })

  it("reminds opted-in devices three days before each renewal, once", async () => {
    const t = makeConvexTest()
    const now = Date.now()
    const ana = await signedIn(t, "clerk_ana")
    await device(ana, ME, "phone", { renewalReminders: true })
    await device(ana, LAPTOP, "tablet", { feedbackReplies: true })
    const sync = (renewsAt: number | undefined, observedAt: number) =>
      t.mutation(internal.revenuecat.commitSync, {
        environment: "PRODUCTION",
        snapshots: [{ appUserIds: ["clerk_ana"], enabled: true, observedAt, renewsAt }],
      })
    await sync(now + 30 * DAY, 1)
    const sent = expo()

    await t.mutation(internal.notifications.remindRenewals, {})
    expect(sent).toEqual([])

    jest.setSystemTime(now + 30 * DAY - RENEWAL_REMINDER_LEAD_MS)
    await sync(now + 30 * DAY, 2)
    await t.mutation(internal.notifications.remindRenewals, {})
    await t.mutation(internal.notifications.remindRenewals, {})
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())
    expect(sent).toEqual([
      expect.objectContaining({
        to: token("phone"),
        title: "Scryve Pro",
        body: "3日後に更新されます。",
        data: { url: "/account" },
      }),
    ])

    await sync(now + 60 * DAY, 3)
    await sync(undefined, 4)
    jest.setSystemTime(now + 60 * DAY - RENEWAL_REMINDER_LEAD_MS)
    await t.mutation(internal.notifications.remindRenewals, {})
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())
    expect(sent).toHaveLength(1)
  })

  it("unlinks a deleted account's devices but keeps this install's feedback replies", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "clerk_ana")
    await device(ana, ME, "phone", { feedbackReplies: true, renewalReminders: true })
    await device(ana, LAPTOP, "tablet", { renewalReminders: true })
    const user = await t.run((ctx) => ctx.db.query("users").first())

    await t.run((ctx) => forgetAccountDevices(ctx, user!._id))
    expect(await devices(t)).toEqual([
      expect.objectContaining({
        token: token("phone"),
        feedbackReplies: true,
        renewalReminders: false,
      }),
    ])
    expect((await devices(t))[0]).not.toHaveProperty("userId")
  })

  it("forgets devices Expo says are gone", async () => {
    const t = makeConvexTest()
    await device(t, ME, "gone", { feedbackReplies: true })
    expo({ [token("gone")]: { status: "error", details: { error: "DeviceNotRegistered" } } })

    await t.action(internal.notifications.send, {
      messages: [{ to: token("gone"), body: "Hi", url: "/feedback" }],
    })
    expect(await devices(t)).toEqual([])
  })
})
