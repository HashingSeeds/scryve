import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./legal.ts": async () => jest.requireActual("./legal"),
}

describe("legal acceptances", () => {
  it("returns null for a signed-out visitor", async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.legal.currentAcceptances, {})).resolves.toBeNull()
  })

  it("records an acceptance and reads it back", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "consent-user" })
    await actor.mutation(api.legal.recordAcceptance, {
      document: "terms",
      version: "2026-08-18",
      platform: "ios",
    })
    await expect(actor.query(api.legal.currentAcceptances, {})).resolves.toEqual([
      { document: "terms", version: "2026-08-18", acceptedAt: expect.any(Number) },
    ])
  })

  it("keeps one row per document and updates it on a new version", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "consent-user" })
    await actor.mutation(api.legal.recordAcceptance, {
      document: "privacy",
      version: "2026-01-01",
      platform: "android",
    })
    await actor.mutation(api.legal.recordAcceptance, {
      document: "privacy",
      version: "2026-08-18",
      platform: "android",
    })
    const acceptances = await actor.query(api.legal.currentAcceptances, {})
    expect(acceptances).toEqual([
      { document: "privacy", version: "2026-08-18", acceptedAt: expect.any(Number) },
    ])
  })

  it("does not separate acceptances between users", async () => {
    const t = convexTest(schema, modules)
    await t.withIdentity({ subject: "first" }).mutation(api.legal.recordAcceptance, {
      document: "terms",
      version: "2026-08-18",
      platform: "web",
    })
    await expect(
      t.withIdentity({ subject: "second" }).query(api.legal.currentAcceptances, {}),
    ).resolves.toEqual([])
  })

  it("rejects an acceptance from a signed-out visitor", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.legal.recordAcceptance, {
        document: "terms",
        version: "2026-08-18",
        platform: "ios",
      }),
    ).rejects.toThrow("Authentication required")
  })

  it("rejects a blank version", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.withIdentity({ subject: "blank" }).mutation(api.legal.recordAcceptance, {
        document: "terms",
        version: "   ",
        platform: "ios",
      }),
    ).rejects.toThrow("version is required")
  })
})
