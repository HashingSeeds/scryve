import { makeConvexTest } from "../test/convexTest"
import { api } from "./_generated/api"

describe("legal acceptances", () => {
  it("returns null for a signed-out visitor", async () => {
    const t = makeConvexTest()
    await expect(t.query(api.legal.currentAcceptances, {})).resolves.toBeNull()
  })

  it("records an acceptance and reads it back", async () => {
    const t = makeConvexTest()
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
    const t = makeConvexTest()
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
    const t = makeConvexTest()
    await t.withIdentity({ subject: "first" }).mutation(api.legal.recordAcceptance, {
      document: "terms",
      version: "2026-08-18",
      platform: "web",
    })
    await expect(
      t.withIdentity({ subject: "second" }).query(api.legal.currentAcceptances, {}),
    ).resolves.toEqual([])
  })

  it("refuses to record consent for a different account than the one that gave it", async () => {
    const t = makeConvexTest()
    const second = t.withIdentity({ subject: "second" })
    await expect(
      second.mutation(api.legal.recordAcceptance, {
        document: "terms",
        version: "2026-08-18",
        platform: "ios",
        intendedAccount: "first",
      }),
    ).rejects.toMatchObject({ data: { code: "account_changed" } })
    await expect(second.query(api.legal.currentAcceptances, {})).resolves.toEqual([])
    await second.mutation(api.legal.recordAcceptance, {
      document: "terms",
      version: "2026-08-18",
      platform: "ios",
      intendedAccount: "second",
    })
    await expect(second.query(api.legal.currentAcceptances, {})).resolves.toHaveLength(1)
  })

  it("rejects an acceptance from a signed-out visitor", async () => {
    const t = makeConvexTest()
    await expect(
      t.mutation(api.legal.recordAcceptance, {
        document: "terms",
        version: "2026-08-18",
        platform: "ios",
      }),
    ).rejects.toThrow("Authentication required")
  })

  it("rejects a blank version", async () => {
    const t = makeConvexTest()
    await expect(
      t.withIdentity({ subject: "blank" }).mutation(api.legal.recordAcceptance, {
        document: "terms",
        version: "   ",
        platform: "ios",
      }),
    ).rejects.toThrow("version is required")
  })
})
