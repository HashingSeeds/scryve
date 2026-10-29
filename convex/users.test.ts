import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"

function clerkUsernames(usernames: Record<string, string | null>) {
  return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const clerkUserId = decodeURIComponent(String(input).split("/").pop() ?? "")
    return new Response(JSON.stringify({ id: clerkUserId, username: usernames[clerkUserId] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  })
}

async function settle(t: ConvexTestHarness) {
  await t.finishAllScheduledFunctions(() => jest.runAllTimers())
}

async function storedUser(t: ConvexTestHarness, clerkUserId: string) {
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
    const t = makeConvexTest()
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
    const t = makeConvexTest()
    await expect(
      t.mutation(api.users.syncCurrent, { displayName: "Nobody", username: "real_owner" }),
    ).rejects.toThrow("Authentication required")
  })

  it("keeps a filter hold when Clerk clears the username", async () => {
    const t = makeConvexTest()
    const usernames: Record<string, string | null> = { rude: "sh1t-lord" }
    clerkUsernames(usernames)
    const rude = t.withIdentity({ subject: "rude" })
    await rude.mutation(api.users.syncCurrent, { displayName: "Rude", username: "sh1t-lord" })
    await settle(t)

    usernames.rude = null
    await rude.mutation(api.users.syncCurrent, { displayName: "Rude", username: "" })
    await settle(t)
    const rudeUser = await storedUser(t, "rude")
    expect(rudeUser?.username).toBeUndefined()
    expect(rudeUser?.moderationHold).toMatchObject({ reason: "filter" })
  })

  it("keeps a filter hold placed by reports when the same name syncs again", async () => {
    const t = makeConvexTest()
    clerkUsernames({ reported: "fine_name" })
    const reported = t.withIdentity({ subject: "reported" })
    await reported.mutation(api.users.syncCurrent, { displayName: "R", username: "fine_name" })
    await settle(t)
    const user = await storedUser(t, "reported")
    await t.run((ctx) =>
      ctx.db.patch(user!._id, {
        moderationHold: {
          placeholderUsername: "player_held",
          heldUsername: "fine_name",
          reason: "filter",
          createdAt: Date.now(),
        },
      }),
    )

    await reported.mutation(api.users.syncCurrent, { displayName: "R", username: "other_name" })
    await settle(t)
    expect((await storedUser(t, "reported"))?.moderationHold).toMatchObject({ reason: "filter" })
  })

  it("drops a Clerk refresh that a newer change overtook", async () => {
    const t = makeConvexTest()
    clerkUsernames({ renamer: "new_handle" })
    const renamer = t.withIdentity({ subject: "renamer" })
    await renamer.mutation(api.users.syncCurrent, { displayName: "R", username: "new_handle" })
    await settle(t)
    const { updatedAt } = (await storedUser(t, "renamer"))!

    await t.mutation(internal.users.applyClerkUsername, {
      clerkUserId: "renamer",
      username: "old_handle",
      fetchStartedAt: updatedAt - 1,
    })
    expect(await storedUser(t, "renamer")).toMatchObject({ username: "new_handle" })
  })

  it("skips Clerk when the client's username already matches, and caps refreshes", async () => {
    const t = makeConvexTest()
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
    const t = makeConvexTest()
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

describe("users.syncCurrent profile", () => {
  const avatarUrl = "https://img.clerk.com/avatar.png"

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(1_000)
  })
  afterEach(() => jest.useRealTimers())

  it("accepts only HTTPS avatar URLs", async () => {
    const t = makeConvexTest()
    const actor = t.withIdentity({ subject: "avatar-user" })
    await expect(
      actor.mutation(api.users.syncCurrent, {
        displayName: "Avatar",
        avatarUrl: "http://images.example.test/avatar.png",
      }),
    ).rejects.toThrow("HTTPS")
    await expect(
      actor.mutation(api.users.syncCurrent, {
        displayName: "Avatar",
        avatarUrl: "https://images.example.test/avatar.png",
      }),
    ).resolves.toBeDefined()
  })

  it("leaves an unchanged profile unwritten and still applies stored Pro", async () => {
    const t = makeConvexTest()
    const player = t.withIdentity({ subject: "steady" })
    await player.mutation(api.users.syncCurrent, { displayName: "Steady", avatarUrl })
    const before = await storedUser(t, "steady")
    await t.run((ctx) =>
      ctx.db.insert("revenueCatCustomerStates", {
        appUserId: "steady",
        enabled: true,
        environment: "PRODUCTION",
        observedAt: 500,
        updatedAt: 500,
      }),
    )

    jest.setSystemTime(2_000)
    await player.mutation(api.users.syncCurrent, { displayName: "Steady", avatarUrl })
    expect(await storedUser(t, "steady")).toEqual(before)
    const entitlements = await t.run((ctx) =>
      ctx.db
        .query("userEntitlements")
        .withIndex("by_user", (q) => q.eq("userId", before!._id))
        .collect(),
    )
    expect(entitlements).toContainEqual(
      expect.objectContaining({ feature: "unlimited_decks", enabled: true }),
    )
  })

  it("writes a changed name or avatar", async () => {
    const t = makeConvexTest()
    const player = t.withIdentity({ subject: "changer" })
    await player.mutation(api.users.syncCurrent, { displayName: "Before", avatarUrl })

    jest.setSystemTime(2_000)
    await player.mutation(api.users.syncCurrent, { displayName: "After", avatarUrl })
    expect(await storedUser(t, "changer")).toMatchObject({ displayName: "After", updatedAt: 2_000 })

    jest.setSystemTime(3_000)
    await player.mutation(api.users.syncCurrent, { displayName: "After" })
    const user = await storedUser(t, "changer")
    expect(user?.avatarUrl).toBeUndefined()
    expect(user?.updatedAt).toBe(3_000)
  })

  it("rejects an unchanged sync while account deletion is in progress", async () => {
    const t = makeConvexTest()
    const player = t.withIdentity({ subject: "leaving" })
    await player.mutation(api.users.syncCurrent, { displayName: "Leaving" })
    await t.run((ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        clerkUserId: "leaving",
        status: "processing",
        attempts: 0,
        requestedAt: 1_000,
        updatedAt: 1_000,
      }),
    )
    await expect(
      player.mutation(api.users.syncCurrent, { displayName: "Leaving" }),
    ).rejects.toThrow("Account deletion is in progress")
  })
})
