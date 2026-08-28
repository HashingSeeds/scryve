import { convexTest } from "convex-test"

import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./http.ts": async () => jest.requireActual("./http"),
  "./waitlist.ts": async () => jest.requireActual("./waitlist"),
}

const secret = "test-waitlist-secret"

async function submit(t: ReturnType<typeof convexTest>, body: unknown, token = secret) {
  return await t.fetch("/waitlist/submissions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

describe("wait-list ingestion", () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.WAITLIST_INGEST_SECRET
    process.env.WAITLIST_INGEST_SECRET = secret
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.WAITLIST_INGEST_SECRET
    else process.env.WAITLIST_INGEST_SECRET = previousSecret
  })

  it("rejects requests without the shared secret", async () => {
    const t = convexTest(schema, modules)
    const response = await submit(
      t,
      { email: "player@example.com", platforms: ["web"] },
      "wrong-secret",
    )

    expect(response.status).toBe(401)
    await expect(t.run((ctx) => ctx.db.query("waitlistSubmissions").collect())).resolves.toEqual([])
  })

  it("stores a normalized wait-list submission", async () => {
    const t = convexTest(schema, modules)
    const response = await submit(t, {
      email: "  Player@Example.com ",
      platforms: ["web", "ios"],
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ alreadyJoined: false })
    const rows = await t.run((ctx) => ctx.db.query("waitlistSubmissions").collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: "player@example.com",
      platforms: ["web", "ios"],
      status: "waiting",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
  })

  it("updates platform preferences without resetting a managed status", async () => {
    const t = convexTest(schema, modules)
    await submit(t, { email: "player@example.com", platforms: ["web"] })
    const [created] = await t.run((ctx) => ctx.db.query("waitlistSubmissions").collect())
    await t.run((ctx) => ctx.db.patch(created._id, { status: "invited", invitedAt: Date.now() }))

    const response = await submit(t, {
      email: "PLAYER@example.com",
      platforms: ["android"],
    })

    await expect(response.json()).resolves.toEqual({ alreadyJoined: true })
    const [updated] = await t.run((ctx) => ctx.db.query("waitlistSubmissions").collect())
    expect(updated).toMatchObject({
      _id: created._id,
      platforms: ["android"],
      status: "invited",
      invitedAt: expect.any(Number),
    })
  })
})
