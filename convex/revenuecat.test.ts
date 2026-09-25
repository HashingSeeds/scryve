import { convexTest, type TestConvexForDataModelAndIdentity } from "convex-test"

import { api } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"
import { deletedIdentityHash } from "./lib/auth"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./http.ts": async () => jest.requireActual("./http"),
  "./revenuecat.ts": async () => jest.requireActual("./revenuecat"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const webhookAuth = "Bearer webhook-test"
const apiKey = "sk_test_revenuecat"
type Harness = TestConvexForDataModelAndIdentity<DataModel>

function subscriberResponse({
  enabled,
  observedAt,
  sandbox = false,
  expiresDate,
  gracePeriodExpiresDate = null,
  lifetime = false,
}: {
  enabled: boolean
  observedAt: number
  sandbox?: boolean
  expiresDate?: string
  gracePeriodExpiresDate?: string | null
  lifetime?: boolean
}) {
  const productIdentifier = "scryve_pro_monthly"
  return new Response(
    JSON.stringify({
      request_date_ms: observedAt,
      subscriber: {
        entitlements: enabled
          ? {
              "Count Pro": {
                expires_date: lifetime
                  ? null
                  : (expiresDate ?? new Date(observedAt + 86_400_000).toISOString()),
                grace_period_expires_date: gracePeriodExpiresDate,
                product_identifier: productIdentifier,
              },
            }
          : {},
        subscriptions: lifetime ? {} : { [productIdentifier]: { is_sandbox: sandbox } },
        non_subscriptions: lifetime ? { [productIdentifier]: [{ is_sandbox: sandbox }] } : {},
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  )
}

function webhook(event: Record<string, unknown>) {
  return {
    method: "POST",
    headers: { "authorization": webhookAuth, "content-type": "application/json" },
    body: JSON.stringify({ api_version: "1.0", event }),
  }
}

function sendWebhook(t: Harness, event: Record<string, unknown>) {
  return t.fetch("/revenuecat/webhooks", webhook(event))
}

async function createUser(t: Harness, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

async function entitlements(t: Harness, clerkUserId: string) {
  return await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique()
    if (!user) return []
    return await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(10)
  })
}

describe("RevenueCat entitlement sync", () => {
  beforeEach(() => {
    process.env.REVENUECAT_WEBHOOK_AUTH = webhookAuth
    process.env.REVENUECAT_SECRET_API_KEY = apiKey
    process.env.REVENUECAT_ENVIRONMENT = "PRODUCTION"
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.REVENUECAT_WEBHOOK_AUTH
    delete process.env.REVENUECAT_SECRET_API_KEY
    delete process.env.REVENUECAT_ENVIRONMENT
  })

  it("authenticates webhooks and syncs every premium feature for an alias once", async () => {
    const t = convexTest(schema, modules)
    await createUser(t, "clerk_alias")
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(subscriberResponse({ enabled: true, observedAt: 200 }))
    const event = {
      id: "event-alias",
      type: "RENEWAL",
      event_timestamp_ms: 190,
      environment: "PRODUCTION",
      app_user_id: "$RCAnonymousID:one",
      original_app_user_id: "$RCAnonymousID:one",
      aliases: ["clerk_alias"],
    }

    const unauthorized = await t.fetch("/revenuecat/webhooks", {
      method: "POST",
      body: JSON.stringify({ event }),
    })
    expect(unauthorized.status).toBe(401)
    expect((await sendWebhook(t, event)).status).toBe(200)
    expect((await sendWebhook(t, event)).status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await entitlements(t, "clerk_alias")).toEqual(
      expect.arrayContaining(
        [
          "full_history",
          "pro_decks_limit",
          "unlimited_decks",
          "deck_analytics",
          "deck_versions",
        ].map((feature) =>
          expect.objectContaining({ feature, enabled: true, source: "revenuecat" }),
        ),
      ),
    )
  })

  it("keeps the newest fetched state when webhook delivery is out of order", async () => {
    const t = convexTest(schema, modules)
    await createUser(t, "clerk_ordered")
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    fetchSpy.mockResolvedValueOnce(subscriberResponse({ enabled: true, observedAt: 200 }))
    fetchSpy.mockResolvedValueOnce(subscriberResponse({ enabled: false, observedAt: 100 }))

    for (const id of ["newer", "older"])
      expect(
        (
          await sendWebhook(t, {
            id,
            type: "RENEWAL",
            event_timestamp_ms: id === "newer" ? 200 : 100,
            environment: "PRODUCTION",
            app_user_id: "clerk_ordered",
            original_app_user_id: "clerk_ordered",
            aliases: [],
          })
        ).status,
      ).toBe(200)

    expect(await entitlements(t, "clerk_ordered")).toEqual(
      expect.arrayContaining([expect.objectContaining({ feature: "full_history", enabled: true })]),
    )
  })

  it("returns a retryable failure without deduping a failed subscriber fetch", async () => {
    const t = convexTest(schema, modules)
    await createUser(t, "clerk_retry")
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    fetchSpy.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    fetchSpy.mockResolvedValueOnce(subscriberResponse({ enabled: true, observedAt: 300 }))
    const requestEvent = {
      id: "event-retry",
      type: "INITIAL_PURCHASE",
      event_timestamp_ms: 300,
      environment: "PRODUCTION",
      app_user_id: "clerk_retry",
      original_app_user_id: "clerk_retry",
      aliases: [],
    }

    expect((await sendWebhook(t, requestEvent)).status).toBe(502)
    expect((await sendWebhook(t, requestEvent)).status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(await entitlements(t, "clerk_retry")).toEqual(
      expect.arrayContaining([expect.objectContaining({ feature: "full_history", enabled: true })]),
    )
  })

  it("stores missing-user state and applies it when Clerk creates the user", async () => {
    const t = convexTest(schema, modules)
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(subscriberResponse({ enabled: true, observedAt: 400 }))
    expect(
      (
        await sendWebhook(t, {
          id: "event-before-user",
          type: "INITIAL_PURCHASE",
          event_timestamp_ms: 400,
          environment: "PRODUCTION",
          app_user_id: "clerk_later",
          original_app_user_id: "clerk_later",
          aliases: [],
        })
      ).status,
    ).toBe(200)

    await createUser(t, "clerk_later")
    expect(await entitlements(t, "clerk_later")).toEqual(
      expect.arrayContaining([expect.objectContaining({ feature: "full_history", enabled: true })]),
    )
  })

  it("does not recreate billing state for a deleted identity", async () => {
    const t = convexTest(schema, modules)
    const clerkUserId = "clerk_deleted"
    await t.run(async (ctx) => {
      await ctx.db.insert("accountDeletionReceipts", {
        deletedIdentityHash: await deletedIdentityHash(clerkUserId),
        token: "deleted-revenuecat-user",
        status: "completed",
        requestedAt: 1,
        updatedAt: 1,
      })
    })
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(subscriberResponse({ enabled: true, observedAt: 450 }))

    expect(
      (
        await sendWebhook(t, {
          id: "event-deleted-user",
          type: "RENEWAL",
          event_timestamp_ms: 450,
          environment: "PRODUCTION",
          app_user_id: clerkUserId,
          original_app_user_id: clerkUserId,
          aliases: [],
        })
      ).status,
    ).toBe(200)
    expect(await t.run((ctx) => ctx.db.query("revenueCatCustomerStates").collect())).toEqual([])
  })

  it("syncs transfer source and destination independently and ignores sandbox events", async () => {
    const t = convexTest(schema, modules)
    await createUser(t, "clerk_source")
    await createUser(t, "clerk_destination")
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      subscriberResponse({
        enabled: String(input).includes("clerk_destination"),
        observedAt: 500,
      }),
    )
    expect(
      (
        await sendWebhook(t, {
          id: "event-transfer",
          type: "TRANSFER",
          event_timestamp_ms: 500,
          environment: "PRODUCTION",
          transferred_from: ["clerk_source"],
          transferred_to: ["clerk_destination"],
        })
      ).status,
    ).toBe(200)
    expect((await entitlements(t, "clerk_source"))[0]).toMatchObject({ enabled: false })
    expect((await entitlements(t, "clerk_destination"))[0]).toMatchObject({ enabled: true })

    expect(
      (
        await sendWebhook(t, {
          id: "event-sandbox",
          type: "RENEWAL",
          event_timestamp_ms: 600,
          environment: "SANDBOX",
          app_user_id: "clerk_destination",
          original_app_user_id: "clerk_destination",
          aliases: [],
        })
      ).status,
    ).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    expect(
      (
        await sendWebhook(t, {
          id: "event-test",
          type: "TEST",
          event_timestamp_ms: 700,
          environment: "PRODUCTION",
        })
      ).status,
    ).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("maps lifetime, grace-period, sandbox, and expired Count Pro state to server access", async () => {
    const t = convexTest(schema, modules)
    const actor = await createUser(t, "clerk_status")
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    fetchSpy.mockResolvedValueOnce(
      subscriberResponse({ enabled: true, observedAt: 700, lifetime: true }),
    )
    await actor.action(api.revenuecat.syncCurrent, {})
    await expect(actor.query(api.entitlements.current, {})).resolves.toEqual({
      fullHistory: true,
      proDecksLimit: true,
      unlimitedDecks: true,
      deckAnalytics: true,
      deckVersions: true,
    })
    await expect(actor.query(api.decks.listMine, {})).resolves.toMatchObject({
      capacity: { premium: true, limit: 100 },
    })

    fetchSpy.mockResolvedValueOnce(
      subscriberResponse({
        enabled: true,
        observedAt: 800,
        expiresDate: new Date(799).toISOString(),
        gracePeriodExpiresDate: new Date(900).toISOString(),
      }),
    )
    await actor.action(api.revenuecat.syncCurrent, {})
    await expect(actor.query(api.entitlements.current, {})).resolves.toMatchObject({
      fullHistory: true,
    })

    fetchSpy.mockResolvedValueOnce(
      subscriberResponse({ enabled: true, observedAt: 900, sandbox: true }),
    )
    await actor.action(api.revenuecat.syncCurrent, {})
    await expect(actor.query(api.entitlements.current, {})).resolves.toMatchObject({
      fullHistory: false,
      proDecksLimit: false,
    })

    fetchSpy.mockResolvedValueOnce(subscriberResponse({ enabled: false, observedAt: 1_000 }))
    await actor.action(api.revenuecat.syncCurrent, {})
    await expect(actor.query(api.entitlements.current, {})).resolves.toMatchObject({
      fullHistory: false,
      proDecksLimit: false,
    })
  })

  it("lets only the authenticated caller refresh their current state", async () => {
    const t = convexTest(schema, modules)
    const actor = await createUser(t, "clerk_action")
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(subscriberResponse({ enabled: true, observedAt: 700 }))

    await expect(t.action(api.revenuecat.syncCurrent, {})).rejects.toThrow(
      "Authentication required",
    )
    await expect(actor.action(api.revenuecat.syncCurrent, {})).resolves.toEqual({
      synced: true,
      enabled: true,
    })
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://api.revenuecat.com/v1/subscribers/clerk_action",
    )
  })
})
