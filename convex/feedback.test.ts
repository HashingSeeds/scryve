import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { deleteAccountFeedback } from "./feedback"
import { feedbackCard } from "./lib/feedback"

const ME = "a".repeat(64)
const OTHER = "b".repeat(64)

async function submit(t: ConvexTestHarness, key = ME) {
  return await t.mutation(api.feedback.submit, {
    key,
    kind: "feature",
    body: "Sync timers\nKeep the clock on every phone.",
    includeAccount: false,
    appVersion: "2.1.0",
    platform: "ios",
  })
}

let seq = 0
async function apollo(
  t: ConvexTestHarness,
  requestId: Id<"feedbackRequests">,
  actionId: string,
  text?: string,
) {
  seq += 1
  await t.mutation(internal.feedback.applyApolloEvent, {
    event: { seq, key: `scryve:${requestId}`, actionId, ...(text ? { text } : {}) },
  })
  return seq
}

async function signedIn(t: ConvexTestHarness, subject: string) {
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: subject,
      displayName: "Ana",
      username: "ana",
      createdAt: 0,
      updatedAt: 0,
    }),
  )
  return t.withIdentity({ subject })
}

describe("feedback", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("shows a long thread's newest messages in order", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await t.run(async (ctx) => {
      for (let i = 1; i <= 205; i++)
        await ctx.db.insert("feedbackMessages", { requestId, from: "player", body: `m${i}` })
    })
    const bodies = (await t.query(api.feedback.thread, { key: ME, requestId }))!.messages.map(
      (message) => message.body,
    )
    expect(bodies).toHaveLength(200)
    expect(bodies.slice(-2)).toEqual(["m204", "m205"])
  })

  it("shows a thread only to its sender, and null for malformed ids", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    expect(await t.query(api.feedback.thread, { key: OTHER, requestId })).toBeNull()
    expect(await t.query(api.feedback.thread, { key: ME, requestId: "not-a-real-id" })).toBeNull()
    expect(await t.query(api.feedback.mine, { key: OTHER })).toEqual([])
    expect(await t.query(api.feedback.mine, { key: ME })).toMatchObject([
      { _id: requestId, linked: false, unread: false },
    ])
  })

  it("turns Apollo replies into team messages, each applied once", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await t.mutation(api.feedback.reply, { key: ME, requestId, body: "Also on web please" })

    const replySeq = await apollo(t, requestId, "reply", "On it.")
    await t.mutation(internal.feedback.applyApolloEvent, {
      event: { seq: replySeq, key: `scryve:${requestId}`, actionId: "reply", text: "On it." },
    })

    const thread = await t.query(api.feedback.thread, { key: ME, requestId })
    expect(thread?.messages.map(({ from, body }) => [from, body])).toEqual([
      ["player", "Also on web please"],
      ["team", "On it."],
    ])
    expect(thread?.request).toMatchObject({ unread: true })

    await t.mutation(api.feedback.markRead, { key: ME, requestId })
    expect(await t.query(api.feedback.mine, { key: ME })).toMatchObject([{ unread: false }])
  })

  it("ignores Apollo events for other keys and actions, but still moves past them", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await t.mutation(internal.feedback.applyApolloEvent, { event: { seq: 50, key: "other:1" } })
    await t.mutation(internal.feedback.applyApolloEvent, {
      event: { seq: 51, key: `scryve:${requestId}`, actionId: "approve", text: "yes" },
    })
    expect(await t.query(internal.feedback.apolloCursor, {})).toBe(51)
    expect((await t.query(api.feedback.thread, { key: ME, requestId }))?.messages).toEqual([])
  })

  it("links a request to the account only when the player asks", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "ana-subject")
    const draft = { key: ME, kind: "bug" as const, body: "Crash on launch" }
    await expect(
      t.mutation(api.feedback.submit, { ...draft, includeAccount: true }),
    ).rejects.toThrow("Sign in to include your account")

    const linked = await ana.mutation(api.feedback.submit, { ...draft, includeAccount: true })
    const anonymous = await ana.mutation(api.feedback.submit, { ...draft, includeAccount: false })

    expect((await ana.query(api.feedback.mine, { key: OTHER })).map(({ _id }) => _id)).toEqual([
      linked,
    ])
    expect(await t.query(internal.feedback.apolloCardInput, { requestId: linked })).toMatchObject({
      account: "@ana",
    })
    expect(
      await t.query(internal.feedback.apolloCardInput, { requestId: anonymous }),
    ).not.toHaveProperty("account")

    await ana.mutation(api.feedback.setAccount, { key: ME, requestId: linked, included: false })
    expect(await ana.query(api.feedback.mine, { key: OTHER })).toEqual([])
  })

  it("won't link feedback to an account that is being deleted", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "ana-subject")
    const linked = await ana.mutation(api.feedback.submit, {
      key: ME,
      kind: "bug",
      body: "Crash on launch",
      includeAccount: true,
    })
    await t.run((ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        clerkUserId: "ana-subject",
        status: "processing",
        attempts: 0,
        requestedAt: 0,
        updatedAt: 0,
      }),
    )

    await expect(
      ana.mutation(api.feedback.submit, {
        key: OTHER,
        kind: "bug",
        body: "Again",
        includeAccount: true,
      }),
    ).rejects.toThrow("Sign in to include your account")
    expect(await ana.query(api.feedback.mine, {})).toEqual([])
    expect(await ana.query(api.feedback.mine, { key: ME })).toMatchObject([{ _id: linked }])
  })

  it("lists account feedback on a device that never sent any", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "ana-subject")
    const linked = await ana.mutation(api.feedback.submit, {
      key: ME,
      kind: "feature",
      body: "Sent from my phone",
      includeAccount: true,
    })
    expect((await ana.query(api.feedback.mine, {})).map(({ _id }) => _id)).toEqual([linked])
    expect(await t.query(api.feedback.mine, {})).toEqual([])
  })

  it("deletes a deleted account's linked requests ten at a time, and no one else's", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "ana-subject")
    const user = await t.run((ctx) => ctx.db.query("users").first())
    const anonymous = await ana.mutation(api.feedback.submit, {
      key: ME,
      kind: "bug",
      body: "Sent without the account",
      includeAccount: false,
    })
    const other = await signedIn(t, "other-subject")
    const kept = await other.mutation(api.feedback.submit, {
      key: OTHER,
      kind: "feature",
      body: "Other request",
      includeAccount: true,
    })
    await t.run(async (ctx) => {
      for (let n = 0; n < 11; n++)
        await ctx.db.insert("feedbackRequests", {
          kind: "feature",
          body: `Request ${n}`,
          senderHash: "h",
          unread: false,
          updatedAt: n,
          userId: user!._id,
        })
    })
    expect(await t.run((ctx) => deleteAccountFeedback(ctx, user!._id))).toBe(10)
    expect(await t.run((ctx) => deleteAccountFeedback(ctx, user!._id))).toBe(1)
    expect(
      (await t.run((ctx) => ctx.db.query("feedbackRequests").collect())).map(({ _id }) => _id),
    ).toEqual([anonymous, kept])
  })

  it("deletes everything an install sent and no one else's", async () => {
    const t = makeConvexTest()
    const theirs = await submit(t, OTHER)
    const mine = await submit(t)
    await t.mutation(api.feedback.reply, { key: ME, requestId: mine, body: "More detail" })

    await t.mutation(api.feedback.deleteMine, { key: ME })

    expect(await t.query(api.feedback.mine, { key: ME })).toEqual([])
    expect((await t.query(api.feedback.mine, { key: OTHER })).map(({ _id }) => _id)).toEqual([
      theirs,
    ])
    expect(await t.run((ctx) => ctx.db.query("feedbackMessages").collect())).toEqual([])
  })

  it("deletes long threads a few hundred messages at a time until they're gone", async () => {
    const t = makeConvexTest()
    const requestIds = [await submit(t), await submit(t)]
    await t.run(async (ctx) => {
      for (const requestId of requestIds)
        for (let i = 0; i < 300; i++)
          await ctx.db.insert("feedbackMessages", { requestId, from: "player", body: `m${i}` })
    })

    await t.mutation(api.feedback.deleteMine, { key: ME })
    expect(await t.run((ctx) => ctx.db.query("feedbackMessages").collect())).toHaveLength(200)
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())

    expect(await t.query(api.feedback.mine, { key: ME })).toEqual([])
    expect(await t.run((ctx) => ctx.db.query("feedbackMessages").collect())).toEqual([])
  })

  it("posts cards to Apollo and pulls Matthew's replies back", async () => {
    process.env.APOLLO_CLOUD_URL = "https://apollo.test/"
    process.env.APOLLO_FEEDBACK_TOKEN = "feedback-token"
    try {
      const t = makeConvexTest()
      const requestId = await submit(t)
      const calls: { url: string; init?: RequestInit }[] = []
      jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        calls.push({ url: String(input), init })
        const body = String(input).includes("/v1/events")
          ? [
              {
                seq: 7,
                key: `scryve:${requestId}`,
                type: "action",
                actionId: "reply",
                text: "Thanks!",
              },
              { seq: 8, key: `scryve:${requestId}`, type: "pick", pick: 0, done: true },
            ]
          : {}
        return new Response(JSON.stringify(body), { status: 200 })
      })

      await t.action(internal.feedback.postApolloCard, { requestId })
      expect(calls[0]?.url).toBe("https://apollo.test/v1/cards")
      expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer feedback-token" })
      expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
        source: "feedback",
        key: `scryve:${requestId}`,
      })

      await t.action(internal.feedback.pullApollo, {})
      expect(calls[1]?.url).toBe("https://apollo.test/v1/events?after=0&source=feedback")
      expect(await t.query(internal.feedback.apolloCursor, {})).toBe(8)
      expect((await t.query(api.feedback.thread, { key: ME, requestId }))?.messages).toMatchObject([
        { from: "team", body: "Thanks!" },
      ])
    } finally {
      delete process.env.APOLLO_CLOUD_URL
      delete process.env.APOLLO_FEEDBACK_TOKEN
      jest.restoreAllMocks()
    }
  })

  it("inserts a retried submit or reply once", async () => {
    const t = makeConvexTest()
    const args = {
      key: ME,
      kind: "bug" as const,
      body: "Crash on launch",
      includeAccount: false,
      clientId: "client-0001",
      sentryEventId: "0123456789abcdef0123456789abcdef",
    }
    const first = await t.mutation(api.feedback.submit, args)
    expect(await t.mutation(api.feedback.submit, args)).toBe(first)
    const reply = { key: ME, requestId: first, body: "More", clientId: "client-0002" }
    await t.mutation(api.feedback.reply, reply)
    await t.mutation(api.feedback.reply, reply)

    expect(await t.query(api.feedback.mine, { key: ME })).toHaveLength(1)
    expect(
      (await t.query(api.feedback.thread, { key: ME, requestId: first }))?.messages,
    ).toHaveLength(1)
    const input = await t.query(internal.feedback.apolloCardInput, { requestId: first })
    expect(feedbackCard(input!).meta).toMatchObject({
      sentry: "https://matthew-chisolm.sentry.io/issues/?query=0123456789abcdef0123456789abcdef",
    })
  })

  it("caps sends across every install, not just each one", async () => {
    const t = makeConvexTest()
    const sender = (n: number) => String(n).padStart(64, "d")
    for (let n = 0; n < 200; n++) await submit(t, sender(n))
    await expect(submit(t, sender(200))).rejects.toThrow("Try again in")
  })

  it("rejects keys that aren't long random strings", async () => {
    const t = makeConvexTest()
    await expect(submit(t, "short")).rejects.toThrow("Invalid feedback key")
  })
})

describe("feedbackCard", () => {
  const request = {
    _id: "r1" as Id<"feedbackRequests">,
    _creationTime: 0,
    kind: "feature" as const,
    body: "See https://evil.test/x\nLike ftp://files.test",
    senderHash: "h",
    unread: false,
    updatedAt: 0,
  }
  const message = (from: "player" | "team", body: string) => ({
    _id: "m" as Id<"feedbackMessages">,
    _creationTime: 0,
    requestId: request._id,
    from,
    body,
  })

  it("asks for Matthew while the player spoke last, titled by the first line", () => {
    const card = feedbackCard({ request, messages: [message("player", "http://a.test")] })
    expect(card).toMatchObject({
      key: "scryve:r1",
      kind: "approval",
      phase: "player:m",
      title: "Idea: See https://evil.test/x",
      meta: { from: "Anonymous" },
    })
    expect(card.body).toBe(`${request.body}\n\nPlayer: http://a.test`)
    expect(card.actions.map(({ id }) => id)).toEqual(["reply"])
  })

  it("files the card under updates once the team replied, keeping the phase", () => {
    const card = feedbackCard({
      request,
      messages: [message("player", "hi"), message("team", "done")],
    })
    expect(card).toMatchObject({ kind: "update", phase: "player:m" })
  })

  it("drops the oldest text first so the newest reply always shows", () => {
    const card = feedbackCard({
      request: { ...request, body: "a".repeat(2000) },
      messages: [message("player", "b".repeat(1990)), message("player", "newest")],
    })
    expect(card.body.length).toBeLessThanOrEqual(4000)
    expect(card.body.endsWith("Player: newest")).toBe(true)
  })
})
