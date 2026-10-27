import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import { forgetAccountDevices, RENEWAL_REMINDER_LEAD_MS } from "./lib/notifications"

const ME = "a".repeat(64)
const LAPTOP = "c".repeat(64)
const HOUR = 60 * 60 * 1000

const token = (name: string) => `ExponentPushToken[${name}]`

function device(
  t: Pick<ConvexTestHarness, "mutation">,
  key: string,
  name: string,
  prefs: { feedbackReplies?: boolean; renewalReminders?: boolean },
) {
  return t.mutation(api.notifications.syncDevice, {
    key,
    token: token(name),
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

function expo() {
  const sent: Record<string, unknown>[] = []
  jest.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    sent.push(...(JSON.parse(String(init?.body)) as Record<string, unknown>[]))
    return Response.json({ data: [] })
  })
  return sent
}

const devices = (t: ConvexTestHarness) => t.run((ctx) => ctx.db.query("pushDevices").collect())

describe("push notifications", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("tells every device that asked when the team replies", async () => {
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
  })

  it("keeps renewal reminders only for signed-in devices, and forgets without a token", async () => {
    const t = makeConvexTest()
    await device(t, ME, "phone", { feedbackReplies: true, renewalReminders: true })
    expect(await devices(t)).toMatchObject([{ renewalReminders: false, locale: "ja" }])

    await t.mutation(api.notifications.forgetDevice, { key: ME })
    expect(await devices(t)).toEqual([])

    const ana = await signedIn(t, "clerk_ana")
    await device(ana, ME, "phone", { renewalReminders: true })
    const user = await t.run((ctx) => ctx.db.query("users").first())
    await t.run((ctx) => forgetAccountDevices(ctx, user!._id))
    expect(await devices(t)).toEqual([])
  })

  it("reminds opted-in devices in the hour that is 3 days before renewal", async () => {
    const t = makeConvexTest()
    const hour = Math.floor(Date.now() / HOUR) * HOUR
    const ana = await signedIn(t, "clerk_ana")
    await device(ana, ME, "phone", { renewalReminders: true })
    await device(ana, LAPTOP, "tablet", { feedbackReplies: true })
    const sync = (renewsAt: number | undefined, observedAt: number) =>
      t.mutation(internal.revenuecat.commitSync, {
        environment: "PRODUCTION",
        snapshots: [{ appUserIds: ["clerk_ana"], enabled: true, observedAt, renewsAt }],
      })
    const sent = expo()
    const remind = async () => {
      await t.mutation(internal.notifications.remindRenewals, {})
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
    }

    await sync(hour + HOUR + RENEWAL_REMINDER_LEAD_MS, 1)
    await remind()
    expect(sent).toEqual([])

    await sync(hour + RENEWAL_REMINDER_LEAD_MS + 5 * 60 * 1000, 2)
    await remind()
    expect(sent).toEqual([
      expect.objectContaining({
        to: token("phone"),
        title: "Scryve Pro",
        body: "3日後に更新されます。",
        data: { url: "/account" },
      }),
    ])

    await sync(undefined, 3)
    await remind()
    expect(sent).toHaveLength(1)
  })
})
