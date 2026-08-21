import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./moderation.ts": async () => jest.requireActual("./moderation"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const PUBLIC_ID = "moderation-game-1234"
type Harness = ReturnType<typeof convexTest<(typeof schema)["tables"]>>
type Actor = ReturnType<Harness["withIdentity"]>

async function seatedGame(t: Harness, usernames: [string, string]) {
  const [hostName, guestName] = usernames
  const host = t.withIdentity({ subject: "host-subject" })
  const guest = t.withIdentity({ subject: "guest-subject" })
  await t.mutation(internal.users.syncFromClerk, {
    clerkUserId: "host-subject",
    displayName: "Host Realname",
    username: hostName,
  })
  await t.mutation(internal.users.syncFromClerk, {
    clerkUserId: "guest-subject",
    displayName: "Guest Realname",
    username: guestName,
  })
  const token = "t".repeat(43)
  await host.mutation(api.games.createLobby, {
    publicId: PUBLIC_ID,
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: token,
    manualCodeCandidates: ["MOD234"],
    hostDisplayName: "Host Realname",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  await guest.mutation(api.games.claimSeat, {
    token,
    displayName: "Guest Realname",
    color: "#2563EB",
    deviceId: "device-guest-001",
  })
  return { host, guest }
}

async function settle(t: Harness) {
  await t.finishAllScheduledFunctions(() => jest.runAllTimers())
}

async function projectionFor(actor: Actor, deviceId: string) {
  return await actor.query(api.games.lobbyProjection, { publicId: PUBLIC_ID, deviceId })
}

async function addThirdSeat(t: Harness) {
  const thirdParty = t.withIdentity({ subject: "third-subject" })
  await t.mutation(internal.users.syncFromClerk, {
    clerkUserId: "third-subject",
    displayName: "Third Realname",
    username: "third-handle",
  })
  await t.run(async (ctx) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", PUBLIC_ID))
      .unique()
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "third-subject"))
      .unique()
    await ctx.db.patch(game!._id, { playerCount: 3 })
    await ctx.db.insert("gamePlayers", {
      gameId: game!._id,
      seat: 3,
      userId: user!._id,
      displayName: "Third Realname",
      usernameAtJoin: "third-handle",
      color: "#059669",
      currentLife: 40,
      joinedAt: Date.now(),
    })
  })
  return thirdParty
}

async function seatOf(actor: Actor, deviceId: string, seat: number) {
  const projection = await projectionFor(actor, deviceId)
  return projection.players.find((player) => player.seat === seat)!
}

describe("moderation", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("never sends the Clerk display name to other players", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    const projection = await projectionFor(host, "device-host-0001")
    expect(projection.players.map((player) => player.displayName)).toEqual([
      "host-handle",
      "guest-handle",
    ])
    expect(JSON.stringify(projection)).not.toContain("Realname")
  })

  it("blocks and masks immediately on report, without waiting for review", async () => {
    const t = convexTest(schema, modules)
    const { host, guest } = await seatedGame(t, ["host-handle", "guest-handle"])
    const guestSeat = await seatOf(host, "device-host-0001", 2)

    const result = await host.mutation(api.moderation.reportPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
      reason: "harassment",
    })
    await settle(t)
    expect(result).toEqual({ blocked: true, held: false })

    const reporterView = await projectionFor(host, "device-host-0001")
    expect(reporterView.players.map((player) => player.displayName)).toEqual([
      "host-handle",
      "Player 2",
    ])
    const otherView = await projectionFor(guest, "device-guest-001")
    expect(otherView.players.map((player) => player.displayName)).toEqual([
      "host-handle",
      "guest-handle",
    ])
    expect(await host.query(api.moderation.myBlocks, {})).toEqual([
      {
        blockedUserId: expect.any(String),
        username: "guest-handle",
        createdAt: expect.any(Number),
      },
    ])
  })

  it("does not expose a blocked username in a finished summary", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    await host.mutation(api.moderation.blockPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
    })
    await host.mutation(api.games.startGame, { publicId: PUBLIC_ID })
    await host.mutation(api.games.finishGame, {
      publicId: PUBLIC_ID,
      result: { kind: "unknown" },
    })

    const summary = await host.query(api.games.connectedSummary, { publicId: PUBLIC_ID })
    expect(summary!.players[1]).toMatchObject({
      displayName: "Player 2",
    })
    expect(summary!.players[1].usernameAtFinish).toBeUndefined()
    expect(JSON.stringify(summary)).not.toContain("guest-handle")
  })

  it("holds a name on the first report when it trips the filter", async () => {
    const t = convexTest(schema, modules)
    const { host, guest } = await seatedGame(t, ["host-handle", "sh1t-lord"])
    await settle(t)
    const guestSeat = await seatOf(host, "device-host-0001", 2)

    const beforeReport = await projectionFor(guest, "device-guest-001")
    expect(beforeReport.players[1].displayName).not.toBe("sh1t-lord")

    const result = await host.mutation(api.moderation.reportPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
      reason: "offensive_username",
    })
    await settle(t)
    expect(result.held).toBe(true)
    const reports = await t.run(async (ctx) => await ctx.db.query("moderationReports").collect())
    expect(reports[0]).toMatchObject({
      status: "open",
      autoAction: "held_on_filter",
      matchedTerms: ["shit"],
    })
  })

  it("holds a name once two distinct players report it", async () => {
    const t = convexTest(schema, modules)
    const { host, guest } = await seatedGame(t, ["host-handle", "guest-handle"])
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    const thirdParty = await addThirdSeat(t)

    await host.mutation(api.moderation.reportPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
      reason: "harassment",
    })
    expect((await projectionFor(guest, "device-guest-001")).players[1].displayName).toBe(
      "guest-handle",
    )

    const second = await thirdParty.mutation(api.moderation.reportPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
      reason: "harassment",
    })
    await settle(t)
    expect(second.held).toBe(true)
    const heldName = (await projectionFor(guest, "device-guest-001")).players[1].displayName
    expect(heldName).not.toBe("guest-handle")
    expect(heldName).toMatch(/^[a-z]+-[a-z]+-\d{2}$/)
  })

  it("counts one open report per reporter", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    for (const reason of ["harassment", "offensive_username"] as const)
      await host.mutation(api.moderation.reportPlayer, {
        publicId: PUBLIC_ID,
        playerId: guestSeat.playerId as Id<"gamePlayers">,
        reason,
      })
    await settle(t)
    const reports = await t.run(async (ctx) => await ctx.db.query("moderationReports").collect())
    expect(reports).toHaveLength(1)
  })

  it("refuses to seat players who have blocked each other", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    await host.mutation(api.moderation.blockPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
    })
    const guest = t.withIdentity({ subject: "guest-subject" })
    const secondToken = "s".repeat(43)
    await t.run(async (ctx) => {
      for (const player of await ctx.db.query("gamePlayers").collect())
        await ctx.db.delete(player._id)
      for (const game of await ctx.db.query("games").collect()) await ctx.db.delete(game._id)
    })
    await host.mutation(api.games.createLobby, {
      publicId: "moderation-game-5678",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken: secondToken,
      manualCodeCandidates: ["MOD567"],
      hostDisplayName: "Host Realname",
      hostColor: "#7C3AED",
      deviceId: "device-host-0002",
    })
    await expect(
      guest.mutation(api.games.claimSeat, {
        token: secondToken,
        displayName: "Guest Realname",
        color: "#2563EB",
        deviceId: "device-guest-002",
      }),
    ).rejects.toThrow("blocked")
  })

  it("restores visibility when a block is lifted", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    await host.mutation(api.moderation.blockPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
    })
    const blocks = await host.query(api.moderation.myBlocks, {})
    await host.mutation(api.moderation.unblockPlayer, {
      blockedUserId: blocks[0].blockedUserId as Id<"users">,
    })
    expect((await projectionFor(host, "device-host-0001")).players[1].displayName).toBe(
      "guest-handle",
    )
  })

  it("releases a reports-based hold once the operator dismisses every open report", async () => {
    const t = convexTest(schema, modules)
    const { host, guest } = await seatedGame(t, ["host-handle", "guest-handle"])
    const thirdParty = await addThirdSeat(t)
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    for (const reporter of [host, thirdParty])
      await reporter.mutation(api.moderation.reportPlayer, {
        publicId: PUBLIC_ID,
        playerId: guestSeat.playerId as Id<"gamePlayers">,
        reason: "harassment",
      })
    await settle(t)
    expect((await projectionFor(guest, "device-guest-001")).players[1].displayName).not.toBe(
      "guest-handle",
    )

    const reports = await t.run(async (ctx) => await ctx.db.query("moderationReports").collect())
    expect(reports).toHaveLength(2)
    const [first, second] = reports
    expect(
      await t.mutation(internal.moderation.dismissReport, {
        reportId: first._id,
        note: "one report still open",
      }),
    ).toEqual({ released: false })
    expect(
      await t.mutation(internal.moderation.dismissReport, {
        reportId: second._id,
        note: "false positive",
      }),
    ).toEqual({ released: true })
    await settle(t)
    expect((await projectionFor(guest, "device-guest-001")).players[1].displayName).toBe(
      "guest-handle",
    )
  })

  it("keeps an operator hold in place when a report is dismissed", async () => {
    const t = convexTest(schema, modules)
    const { host, guest } = await seatedGame(t, ["host-handle", "sh1t-lord"])
    await settle(t)
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    await host.mutation(api.moderation.reportPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
      reason: "harassment",
    })
    const [report] = await t.run(async (ctx) => await ctx.db.query("moderationReports").collect())
    await t.mutation(internal.moderation.upholdReport, { reportId: report._id })
    await t.mutation(internal.moderation.dismissReport, { reportId: report._id })
    await settle(t)
    expect((await projectionFor(guest, "device-guest-001")).players[1].displayName).not.toBe(
      "sh1t-lord",
    )
  })

  it("holds an offensive username that arrives from a Clerk rename", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    await t.mutation(internal.users.syncFromClerk, {
      clerkUserId: "guest-subject",
      displayName: "Guest Realname",
      username: "f4ggot",
    })
    await settle(t)
    const projection = await projectionFor(host, "device-host-0001")
    expect(projection.players[1].displayName).not.toBe("f4ggot")
    expect(projection.players[1].displayName).toMatch(/^[a-z]+-[a-z]+-\d{2}$/)
  })

  it("releases a filter hold when a Clerk rename fixes the username", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "sh1t-lord"])
    await settle(t)

    await t.mutation(internal.users.syncFromClerk, {
      clerkUserId: "guest-subject",
      displayName: "Guest Realname",
      username: "friendly-otter",
    })
    await settle(t)

    expect((await projectionFor(host, "device-host-0001")).players[1].displayName).toBe(
      "friendly-otter",
    )
  })

  it("answers the signup gate without requiring a synced profile", async () => {
    const t = convexTest(schema, modules)
    const newcomer = t.withIdentity({ subject: "newcomer-subject" })
    await expect(
      newcomer.query(api.moderation.usernameIsAcceptable, { username: "sh1t-lord" }),
    ).resolves.toEqual({ acceptable: false })
    await expect(
      newcomer.query(api.moderation.usernameIsAcceptable, { username: "clever-otter-01" }),
    ).resolves.toEqual({ acceptable: true })
  })

  it("lists open reports for the operator with the matched terms", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "sh1t-lord"])
    await settle(t)
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    await host.mutation(api.moderation.reportPlayer, {
      publicId: PUBLIC_ID,
      playerId: guestSeat.playerId as Id<"gamePlayers">,
      reason: "offensive_username",
      note: "seen in a game",
    })
    await settle(t)
    const open = await t.query(internal.moderation.openReports, {})
    expect(open).toHaveLength(1)
    expect(open[0]).toMatchObject({
      reason: "offensive_username",
      note: "seen in a game",
      autoAction: "held_on_filter",
      matchedTerms: ["shit"],
    })
    const alert = await t.query(internal.moderation.reportForAlert, {
      reportId: open[0].reportId,
    })
    expect(alert).toMatchObject({
      reporterUsername: "host-handle",
      gamePublicId: PUBLIC_ID,
      reason: "offensive_username",
      note: "seen in a game",
    })
  })

  it("rejects reporting yourself or a player from another game", async () => {
    const t = convexTest(schema, modules)
    const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
    const ownSeat = await seatOf(host, "device-host-0001", 1)
    await expect(
      host.mutation(api.moderation.reportPlayer, {
        publicId: PUBLIC_ID,
        playerId: ownSeat.playerId as Id<"gamePlayers">,
        reason: "other",
      }),
    ).rejects.toThrow()
    const stranger = t.withIdentity({ subject: "stranger-subject" })
    await t.mutation(internal.users.syncFromClerk, {
      clerkUserId: "stranger-subject",
      displayName: "Stranger",
      username: "stranger-handle",
    })
    const guestSeat = await seatOf(host, "device-host-0001", 2)
    await expect(
      stranger.mutation(api.moderation.reportPlayer, {
        publicId: PUBLIC_ID,
        playerId: guestSeat.playerId as Id<"gamePlayers">,
        reason: "other",
      }),
    ).rejects.toThrow()
  })
})
