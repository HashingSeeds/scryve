import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./moderation.ts": async () => jest.requireActual("./moderation"),
  "./users.ts": async () => jest.requireActual("./users"),
}

type Harness = ReturnType<typeof convexTest<(typeof schema)["tables"]>>

function harness() {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  return t
}

function clerkUsernames(usernames: Record<string, string | null>) {
  return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const clerkUserId = decodeURIComponent(String(input).split("/").pop() ?? "")
    return new Response(JSON.stringify({ id: clerkUserId, username: usernames[clerkUserId] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  })
}

async function settle(t: Harness) {
  await t.finishAllScheduledFunctions(() => jest.runAllTimers())
}

async function storedUser(t: Harness, clerkUserId: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique(),
  )
}

describe("users.syncCurrent usernames", () => {
  const previousClerkSecret = process.env.CLERK_SECRET_KEY

  beforeAll(() => {
    process.env.CLERK_SECRET_KEY = "sk_test_username_sync"
  })
  afterAll(() => {
    if (previousClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = previousClerkSecret
  })
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("stores the Clerk username for the caller, not the one the client sent", async () => {
    const t = harness()
    const fetchSpy = clerkUsernames({ owner: "real_owner", impostor: "impostor_handle" })
    const owner = t.withIdentity({ subject: "owner" })
    await owner.mutation(api.users.syncCurrent, { displayName: "Owner", username: "real_owner" })
    await settle(t)
    expect(await storedUser(t, "owner")).toMatchObject({ username: "real_owner" })
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/users/owner",
      expect.objectContaining({ headers: { Authorization: "Bearer sk_test_username_sync" } }),
    )

    const impostor = t.withIdentity({ subject: "impostor" })
    for (const username of ["real_owner", "unclaimed_celebrity"]) {
      await impostor.mutation(api.users.syncCurrent, { displayName: "Impostor", username })
      await settle(t)
      expect(await storedUser(t, "impostor")).toMatchObject({ username: "impostor_handle" })
    }
    expect(await storedUser(t, "owner")).toMatchObject({ username: "real_owner" })
  })

  it("rejects an unauthenticated sync", async () => {
    const t = harness()
    await expect(
      t.mutation(api.users.syncCurrent, { displayName: "Nobody", username: "real_owner" }),
    ).rejects.toThrow("Authentication required")
  })

  it("runs the name filter on the Clerk username", async () => {
    const t = harness()
    clerkUsernames({ rude: "sh1t-lord" })
    const rude = t.withIdentity({ subject: "rude" })
    await rude.mutation(api.users.syncCurrent, { displayName: "Rude", username: "sh1t-lord" })
    await settle(t)
    expect((await storedUser(t, "rude"))?.moderationHold).toMatchObject({ reason: "filter" })
  })

  it("clears the stored username once Clerk has none", async () => {
    const t = harness()
    const usernames: Record<string, string | null> = { renamer: "old_handle" }
    clerkUsernames(usernames)
    const renamer = t.withIdentity({ subject: "renamer" })
    await renamer.mutation(api.users.syncCurrent, { displayName: "R", username: "old_handle" })
    await settle(t)
    expect(await storedUser(t, "renamer")).toMatchObject({ username: "old_handle" })

    usernames.renamer = null
    await renamer.mutation(api.users.syncCurrent, { displayName: "R", username: "" })
    await settle(t)
    expect((await storedUser(t, "renamer"))?.username).toBeUndefined()
  })

  it("skips Clerk when the client's username already matches, and caps refreshes", async () => {
    const t = harness()
    const fetchSpy = clerkUsernames({ steady: "steady_handle" })
    const steady = t.withIdentity({ subject: "steady" })
    await steady.mutation(api.users.syncCurrent, { displayName: "S", username: "steady_handle" })
    await settle(t)
    await steady.mutation(api.users.syncCurrent, { displayName: "S", username: "steady_handle" })
    await steady.mutation(api.users.syncCurrent, { displayName: "S" })
    await settle(t)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    for (let index = 0; index < 5; index += 1)
      await steady.mutation(api.users.syncCurrent, {
        displayName: "S",
        username: `spoof_${index}`,
      })
    await settle(t)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(await storedUser(t, "steady")).toMatchObject({ username: "steady_handle" })
  })

  it("shows the synced username on a connected board", async () => {
    const t = harness()
    clerkUsernames({ host: "host_handle", joiner: "joiner_cool" })
    const host = t.withIdentity({ subject: "host" })
    await host.mutation(api.users.syncCurrent, { displayName: "Host" })
    const created = await host.mutation(api.games.createLobby, {
      publicId: "username-lobby-123456",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken: "t".repeat(43),
      manualCodeCandidates: ["USR234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: "device-host-0001",
    })
    const joiner = t.withIdentity({ subject: "joiner" })
    await joiner.mutation(api.users.syncCurrent, { displayName: "Joiner", username: "joiner_cool" })
    await settle(t)
    await joiner.mutation(api.games.claimSeat, {
      manualCode: "USR234",
      displayName: "Joiner",
      color: "#2563EB",
    })
    const projection = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: "device-host-0001",
    })
    expect(projection.players.map((player) => player.displayName)).toEqual([
      "Player 1",
      "joiner_cool",
    ])
  })
})
