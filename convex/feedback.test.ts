import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { deleteAccountFeedback } from "./feedback"
import { feedbackCard } from "./lib/feedback"

const ME = "a".repeat(64)
const OTHER = "b".repeat(64)

async function submit(t: ConvexTestHarness, key = ME, extra: { kind?: "feature" | "bug" } = {}) {
  return await t.mutation(api.feedback.submit, {
    key,
    kind: extra.kind ?? "feature",
    title: "Sync timers",
    body: "Keep the clock on every phone.",
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

  it("keeps a request private to its sender until it's published", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)

    expect(await t.query(api.feedback.board, { key: OTHER })).toEqual([])
    expect(await t.query(api.feedback.thread, { key: OTHER, requestId })).toBeNull()
    expect(await t.query(api.feedback.mine, { key: ME })).toMatchObject([
      { _id: requestId, status: "review", published: false, votes: 1, linked: false },
    ])

    await apollo(t, requestId, "publish")
    expect(await t.query(api.feedback.board, { key: OTHER })).toMatchObject([
      { _id: requestId, votes: 1, voted: false, mine: false },
    ])
    const [item] = await t.query(api.feedback.board, {})
    expect(item).not.toHaveProperty("senderHash")
    expect(item).not.toHaveProperty("userId")
  })

  it("sets votes rather than toggling them", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await apollo(t, requestId, "publish")

    await t.mutation(api.feedback.vote, { key: OTHER, requestId, voted: true })
    await t.mutation(api.feedback.vote, { key: OTHER, requestId, voted: true })
    expect(await t.query(api.feedback.board, { key: OTHER })).toMatchObject([
      { votes: 2, voted: true },
    ])

    await t.mutation(api.feedback.vote, { key: OTHER, requestId, voted: false })
    expect(await t.query(api.feedback.board, { key: OTHER })).toMatchObject([
      { votes: 1, voted: false },
    ])
  })

  it("turns Apollo answers into replies and statuses, each applied once", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await t.mutation(api.feedback.reply, { key: ME, requestId, body: "Also on web please" })

    const replySeq = await apollo(t, requestId, "reply", "On it.")
    await t.mutation(internal.feedback.applyApolloEvent, {
      event: { seq: replySeq, key: `scryve:${requestId}`, actionId: "reply", text: "On it." },
    })
    await apollo(t, requestId, "shipped", "2.2.0")

    const thread = await t.query(api.feedback.thread, { key: ME, requestId })
    expect(thread?.messages.map(({ from, body }) => [from, body])).toEqual([
      ["player", "Also on web please"],
      ["team", "On it."],
    ])
    expect(thread?.request).toMatchObject({ status: "shipped", shippedIn: "2.2.0", unread: true })

    await t.mutation(api.feedback.markRead, { key: ME, requestId })
    expect(await t.query(api.feedback.mine, { key: ME })).toMatchObject([{ unread: false }])
  })

  it("ignores Apollo events for other keys and actions, but still moves past them", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await t.mutation(internal.feedback.applyApolloEvent, { event: { seq: 50, key: "other:1" } })
    await t.mutation(internal.feedback.applyApolloEvent, {
      event: { seq: 51, key: `scryve:${requestId}`, actionId: "approve" },
    })
    expect(await t.query(internal.feedback.apolloCursor, {})).toBe(51)
    expect(await t.query(api.feedback.mine, { key: ME })).toMatchObject([{ status: "review" }])
  })

  it("links a request to the account only when the player asks", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "ana-subject")
    await expect(
      t.mutation(api.feedback.submit, {
        key: ME,
        kind: "bug",
        title: "Crash",
        body: "On launch",
        includeAccount: true,
      }),
    ).rejects.toThrow("Sign in to include your account")

    const linked = await ana.mutation(api.feedback.submit, {
      key: ME,
      kind: "bug",
      title: "Crash",
      body: "On launch",
      includeAccount: true,
    })
    const anonymous = await ana.mutation(api.feedback.submit, {
      key: ME,
      kind: "feature",
      title: "Dark board",
      body: "Please",
      includeAccount: false,
    })

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

  it("deletes a deleted account's linked requests but not the ones sent without it", async () => {
    const t = makeConvexTest()
    const ana = await signedIn(t, "ana-subject")
    const draft = { key: ME, kind: "bug" as const, title: "Crash", body: "On launch" }
    await ana.mutation(api.feedback.submit, { ...draft, includeAccount: true })
    const anonymous = await ana.mutation(api.feedback.submit, { ...draft, includeAccount: false })
    const user = await t.run((ctx) => ctx.db.query("users").first())
    await t.run((ctx) => deleteAccountFeedback(ctx, user!._id, 10))
    expect((await t.query(api.feedback.mine, { key: ME })).map(({ _id }) => _id)).toEqual([
      anonymous,
    ])
  })

  it("lets other players report a public request once, and tells Apollo", async () => {
    const t = makeConvexTest()
    const requestId = await submit(t)
    await expect(t.mutation(api.feedback.report, { key: OTHER, requestId })).rejects.toThrow(
      "Feedback not found",
    )
    await apollo(t, requestId, "publish")
    await expect(t.mutation(api.feedback.report, { key: ME, requestId })).rejects.toThrow(
      "Feedback not found",
    )

    await t.mutation(api.feedback.report, { key: OTHER, requestId })
    await t.mutation(api.feedback.report, { key: OTHER, requestId })
    expect(await t.query(api.feedback.board, { key: OTHER })).toMatchObject([{ reported: true }])
    const input = await t.query(internal.feedback.apolloCardInput, { requestId })
    expect(feedbackCard(input!)).toMatchObject({
      phase: "player:1:reports:1",
      meta: { reports: "1" },
    })
  })

  it("deletes everything an install sent and takes back its votes", async () => {
    const t = makeConvexTest()
    const theirs = await submit(t, OTHER)
    await apollo(t, theirs, "publish")
    const mine = await submit(t)
    await t.mutation(api.feedback.reply, { key: ME, requestId: mine, body: "More detail" })
    await t.mutation(api.feedback.vote, { key: ME, requestId: theirs, voted: true })

    await t.mutation(api.feedback.deleteMine, { key: ME })

    expect(await t.query(api.feedback.mine, { key: ME })).toEqual([])
    expect(await t.query(api.feedback.board, {})).toMatchObject([{ _id: theirs, votes: 1 }])
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
    title: "See https://evil.test/x",
    body: "Like ftp://files.test",
    status: "review" as const,
    published: false,
    votes: 3,
    reports: 0,
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

  it("asks for Matthew while the player spoke last", () => {
    const card = feedbackCard({ request, messages: [message("player", "http://a.test")] })
    expect(card).toMatchObject({
      key: "scryve:r1",
      kind: "approval",
      phase: "player:2:reports:0",
      title: "Request: See https://evil.test/x",
      meta: { status: "In review · private", votes: "3", from: "Anonymous" },
    })
    expect(card.body).toBe("Like ftp://files.test\n\nPlayer: http://a.test")
    expect(card.actions.map(({ id }) => id)).toEqual([
      "reply",
      "publish",
      "planned",
      "building",
      "shipped",
      "declined",
    ])
  })

  it("files the card under updates once the team replied, keeping the phase", () => {
    const card = feedbackCard({
      request: { ...request, published: true, status: "shipped", shippedIn: "2.2.0" },
      messages: [message("player", "hi"), message("team", "done")],
    })
    expect(card).toMatchObject({
      kind: "update",
      phase: "player:2:reports:0",
      meta: { status: "Shipped in 2.2.0 · public" },
    })
    expect(card.actions[1]).toMatchObject({ id: "hide" })
  })
})
