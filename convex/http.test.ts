import { convexTest } from "convex-test"
import { Webhook } from "svix"

import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./http.ts": async () => jest.requireActual("./http"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const secret = "whsec_dGVzdC13ZWJob29rLXNlY3JldA=="
const otherSecret = "whsec_b3RoZXItd2ViaG9vay1zZWNyZXQ="
type Harness = ReturnType<typeof convexTest>

async function fetchSigned(t: Harness, event: unknown, signingSecret = secret) {
  const body = JSON.stringify(event)
  const messageId = "msg_test_clerk_webhook"
  const timestamp = new Date()
  const signature = new Webhook(signingSecret).sign(messageId, timestamp, body)

  return await t.fetch("/clerk/webhooks", {
    method: "POST",
    body,
    headers: {
      "svix-id": messageId,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
  })
}

async function users(t: Harness) {
  return await t.run((ctx) => ctx.db.query("users").collect())
}

describe("Clerk webhook user sync", () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = previousSecret
  })

  it("returns 503 without a configured signing secret and leaves users untouched", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET
    const t = convexTest(schema, modules)

    const response = await t.fetch("/clerk/webhooks", { method: "POST", body: "{}" })

    expect(response.status).toBe(503)
    expect(await users(t)).toEqual([])
  })

  it("returns 400 when the payload signature does not verify and leaves users untouched", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret
    const t = convexTest(schema, modules)
    const response = await fetchSigned(
      t,
      {
        type: "user.created",
        data: { id: "clerk_invalid", username: "invalid-signature" },
      },
      otherSecret,
    )

    expect(response.status).toBe(400)
    expect(await users(t)).toEqual([])
  })

  it("returns 400 for a signed user event whose data is missing or not an object", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret
    const t = convexTest(schema, modules)

    const malformedEvents = [
      { type: "user.created" },
      { type: "user.created", data: null },
      { type: "user.updated", data: "not-an-object" },
      { type: "user.updated", data: ["not", "a", "record"] },
    ]
    for (const event of malformedEvents) {
      const response = await fetchSigned(t, event)
      expect(response.status).toBe(400)
    }
    expect(await users(t)).toEqual([])
  })

  it("returns 400 for a signed user.created event without a username", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret
    const t = convexTest(schema, modules)

    const response = await fetchSigned(t, {
      type: "user.created",
      data: { id: "clerk_missing_username", first_name: "Missing" },
    })

    expect(response.status).toBe(400)
    expect(await users(t)).toEqual([])
  })

  it("returns 200 for a signed user.created event and writes its Clerk profile", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret
    const t = convexTest(schema, modules)

    const response = await fetchSigned(t, {
      type: "user.created",
      data: {
        id: "clerk_created",
        username: "created-user",
        first_name: "Ada",
        last_name: "Lovelace",
        image_url: "https://images.example.test/ada.png",
      },
    })

    expect(response.status).toBe(200)
    const rows = await users(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      clerkUserId: "clerk_created",
      displayName: "Ada Lovelace",
      username: "created-user",
      avatarUrl: "https://images.example.test/ada.png",
    })
  })

  it("updates the existing user for a second signed user.updated event", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret
    const t = convexTest(schema, modules)
    const createdResponse = await fetchSigned(t, {
      type: "user.created",
      data: { id: "clerk_updated", username: "before", first_name: "Before" },
    })
    const [created] = await users(t)

    const updatedResponse = await fetchSigned(t, {
      type: "user.updated",
      data: {
        id: "clerk_updated",
        username: "after",
        first_name: "After",
        last_name: "Update",
        image_url: "https://images.example.test/after.png",
      },
    })

    expect(createdResponse.status).toBe(200)
    expect(updatedResponse.status).toBe(200)
    const rows = await users(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      _id: created._id,
      clerkUserId: "clerk_updated",
      displayName: "After Update",
      username: "after",
      avatarUrl: "https://images.example.test/after.png",
    })
  })

  it("returns 200 for a signed unrelated event and leaves users untouched", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret
    const t = convexTest(schema, modules)

    const response = await fetchSigned(t, {
      type: "session.created",
      data: { id: "session_test", user_id: "clerk_ignored" },
    })

    expect(response.status).toBe(200)
    expect(await users(t)).toEqual([])
  })
})
