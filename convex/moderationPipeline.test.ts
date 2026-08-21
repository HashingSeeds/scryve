import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

/**
 * The report-and-hold path in `moderation.test.ts` covers the decisions moderation makes. This
 * file covers the machinery those decisions depend on: the scheduler hand-offs, the alert
 * transport, the paginated history rewrite, and the placeholder allocator. Each of those can fail
 * silently in production — a hold that never propagates or an alert nobody receives looks exactly
 * like a working system from inside a single mutation.
 */

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./moderation.ts": async () => jest.requireActual("./moderation"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const PUBLIC_ID = "moderation-pipeline-01"
const PLACEHOLDER = /^[a-z]+-[a-z]+-\d{2}$/
type Harness = ReturnType<typeof convexTest<(typeof schema)["tables"]>>
type Actor = ReturnType<Harness["withIdentity"]>

async function settle(t: Harness) {
  await t.finishAllScheduledFunctions(() => jest.runAllTimers())
}

async function syncUser(t: Harness, subject: string, username: string) {
  return await t.mutation(internal.users.syncFromClerk, {
    clerkUserId: subject,
    displayName: `${subject} Realname`,
    username,
  })
}

async function seatedGame(t: Harness, usernames: [string, string]) {
  const [hostName, guestName] = usernames
  const host = t.withIdentity({ subject: "host-subject" })
  const guest = t.withIdentity({ subject: "guest-subject" })
  await syncUser(t, "host-subject", hostName)
  await syncUser(t, "guest-subject", guestName)
  const token = "t".repeat(43)
  await host.mutation(api.games.createLobby, {
    publicId: PUBLIC_ID,
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: token,
    manualCodeCandidates: ["MODP01"],
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
  return { host, guest, token }
}

async function seatOf(actor: Actor, deviceId: string, seat: number) {
  const projection = await actor.query(api.games.lobbyProjection, { publicId: PUBLIC_ID, deviceId })
  return projection.players.find((player) => player.seat === seat)!
}

async function reportGuest(host: Actor, playerId: Id<"gamePlayers">, note?: string) {
  return await host.mutation(api.moderation.reportPlayer, {
    publicId: PUBLIC_ID,
    playerId,
    reason: "offensive_username",
    ...(note ? { note } : {}),
  })
}

async function userByUsername(t: Harness, username: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("users")
        .withIndex("by_username_normalized", (q) =>
          q.eq("usernameNormalized", username.toLowerCase()),
        )
        .unique(),
  )
}

function emailBodies(fetchMock: jest.Mock) {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(String(init?.body)) as Record<string, string>,
  )
}

describe("moderation pipeline", () => {
  let fetchMock: jest.Mock
  let originalFetch: typeof globalThis.fetch
  let warn: jest.SpyInstance
  let error: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    originalFetch = globalThis.fetch
    fetchMock = jest.fn(async () => new Response("{}", { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    error = jest.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    warn.mockRestore()
    error.mockRestore()
    delete process.env.RESEND_API_KEY
    delete process.env.MODERATION_ALERT_TO
    delete process.env.MODERATION_ALERT_FROM
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  function configureAlerts() {
    process.env.RESEND_API_KEY = "re_test_key"
    process.env.MODERATION_ALERT_TO = "moderation@example.com"
    process.env.MODERATION_ALERT_FROM = "alerts@example.com"
  }

  describe("alerting an operator", () => {
    it("emails the operator when the filter holds a name at sync, with everything needed to act", async () => {
      configureAlerts()
      const t = convexTest(schema, modules)
      const userId = await syncUser(t, "held-subject", "sh1t-lord")
      await settle(t)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("https://api.resend.com/emails")
      expect(init?.headers).toMatchObject({ Authorization: "Bearer re_test_key" })
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ to: "moderation@example.com", from: "alerts@example.com" })
      expect(body.subject).toContain("sh1t-lord")
      // Without the user id and the matched term an operator cannot review or release the hold.
      expect(body.text).toContain(userId)
      expect(body.text).toContain("shit")
      expect(body.text).toContain("releaseUsernameHold")
    })

    it("holds a slur the profanity dataset does not know and names it in the alert", async () => {
      configureAlerts()
      const t = convexTest(schema, modules)
      await syncUser(t, "held-subject", "hitler88")
      await settle(t)

      const held = await userByUsername(t, "hitler88")
      expect(held?.moderationHold?.reason).toBe("filter")
      expect(held?.moderationHold?.placeholderUsername).toMatch(PLACEHOLDER)
      expect(emailBodies(fetchMock)[0].text).toContain("hitler")
    })

    it("alerts once per hold, not on every later sync of the same held name", async () => {
      configureAlerts()
      const t = convexTest(schema, modules)
      await syncUser(t, "held-subject", "sh1t-lord")
      await settle(t)
      await syncUser(t, "held-subject", "sh1t-lord")
      await syncUser(t, "held-subject", "sh1t-lord")
      await settle(t)

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("emails the operator when a report files, naming the automatic action taken", async () => {
      configureAlerts()
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "sh1t-lord"])
      await settle(t)
      fetchMock.mockClear()
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      await reportGuest(host, guestSeat.playerId as Id<"gamePlayers">, "said it in chat")
      await settle(t)

      const report = await t.query(internal.moderation.openReports, {})
      const body = emailBodies(fetchMock).find((candidate) =>
        candidate.subject.includes("Player report"),
      )!
      expect(body).toBeDefined()
      expect(body.text).toContain("Reporter: host-handle")
      expect(body.text).toContain("said it in chat")
      expect(body.text).toContain("held_on_filter")
      expect(body.text).toContain(report[0].reportId)
      expect(body.text).toContain("24 hours")
    })

    it("says so explicitly when a report triggered no automatic action", async () => {
      configureAlerts()
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      await reportGuest(host, guestSeat.playerId as Id<"gamePlayers">)
      await settle(t)

      const body = emailBodies(fetchMock)[0]
      expect(body.text).toContain("Automatic action: none")
    })

    it("keeps the report and the hold when the alert transport is unconfigured", async () => {
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "sh1t-lord"])
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      await reportGuest(host, guestSeat.playerId as Id<"gamePlayers">)
      await settle(t)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(warn.mock.calls.flat().join(" ")).toContain("alert email is not configured")
      const held = await userByUsername(t, "sh1t-lord")
      expect(held?.moderationHold?.reason).toBe("filter")
      const reports = await t.run(async (ctx) => await ctx.db.query("moderationReports").collect())
      expect(reports).toHaveLength(1)
    })

    it("keeps the hold when Resend rejects the alert", async () => {
      configureAlerts()
      fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }))
      const t = convexTest(schema, modules)
      await syncUser(t, "held-subject", "sh1t-lord")
      await settle(t)

      expect(error.mock.calls.flat().join(" ")).toContain("moderation alert email failed: 429")
      const held = await userByUsername(t, "sh1t-lord")
      expect(held?.moderationHold?.placeholderUsername).toMatch(PLACEHOLDER)
    })
  })

  describe("propagating a hold into finished-game history", () => {
    it("renames the held player across more history than one batch holds", async () => {
      const t = convexTest(schema, modules)
      const userId = await syncUser(t, "held-subject", "clean-handle")
      const gameCount = 30
      await t.run(async (ctx) => {
        for (let index = 0; index < gameCount; index += 1) {
          const gameId = await ctx.db.insert("games", {
            publicId: `history-game-${index}`,
            hostUserId: userId,
            mode: "connected" as const,
            status: "finished" as const,
            playerCount: 2,
            startingLife: 40,
            ruleset: "commander",
            createdAt: index,
            updatedAt: index,
          })
          const playerId = await ctx.db.insert("gamePlayers", {
            gameId,
            seat: 1,
            userId,
            displayName: "Held Realname",
            usernameAtJoin: "clean-handle",
            color: "#7C3AED",
            currentLife: 40,
            joinedAt: index,
          })
          const summaryId = await ctx.db.insert("gameSummaries", {
            gameId,
            publicId: `history-game-${index}`,
            startingLife: 40,
            ruleset: "commander",
            eventCount: 0,
            finishedAt: index,
            players: [
              {
                playerId,
                seat: 1,
                displayName: "clean-handle",
                userId,
                usernameAtFinish: "clean-handle",
                color: "#7C3AED",
                finalLife: 40,
              },
            ],
          })
          await ctx.db.insert("gameHistoryEntries", {
            userId,
            gameId,
            summaryId,
            finishedAt: index,
            outcome: "unknown" as const,
          })
        }
      })

      await syncUser(t, "held-subject", "sh1t-lord")
      await settle(t)

      const held = await userByUsername(t, "sh1t-lord")
      const placeholder = held!.moderationHold!.placeholderUsername
      const summaries = await t.run(async (ctx) => await ctx.db.query("gameSummaries").collect())
      expect(summaries).toHaveLength(gameCount)
      for (const summary of summaries) expect(summary.players[0].usernameAtFinish).toBe(placeholder)

      // And the rewrite reverses when the hold lifts, rather than stranding the placeholder.
      await t.mutation(internal.moderation.releaseUsernameHold, { userId })
      await settle(t)
      const restored = await t.run(async (ctx) => await ctx.db.query("gameSummaries").collect())
      for (const summary of restored) expect(summary.players[0].usernameAtFinish).toBe("sh1t-lord")
    })

    it("hides a held name from the reporter's own history list", async () => {
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "sh1t-lord"])
      await settle(t)
      await host.mutation(api.games.startGame, { publicId: PUBLIC_ID })
      await host.mutation(api.games.finishGame, {
        publicId: PUBLIC_ID,
        result: { kind: "unknown" },
      })
      await settle(t)

      const history = await host.query(api.games.connectedHistory, {
        paginationOpts: { numItems: 10, cursor: null },
      })
      expect(JSON.stringify(history)).not.toContain("sh1t-lord")
    })
  })

  describe("allocating a placeholder", () => {
    it("never hands out a placeholder another account already uses", async () => {
      const t = convexTest(schema, modules)
      // Occupy every name the suggester can produce except one, then force a hold.
      const adjectives = [
        "brisk",
        "bright",
        "clever",
        "curious",
        "eager",
        "lucky",
        "quiet",
        "steady",
        "swift",
        "wily",
      ]
      const nouns = [
        "badger",
        "comet",
        "falcon",
        "griffin",
        "hydra",
        "lantern",
        "otter",
        "phoenix",
        "sapling",
        "wyvern",
      ]
      await t.run(async (ctx) => {
        let index = 0
        for (const adjective of adjectives)
          for (const noun of nouns)
            for (const digits of ["00", "01"]) {
              const username = `${adjective}-${noun}-${digits}`
              await ctx.db.insert("users", {
                clerkUserId: `squatter-${index++}`,
                displayName: "Squatter",
                username,
                usernameNormalized: username,
                createdAt: 0,
                updatedAt: 0,
              })
            }
      })
      const randoms = [0, 0, 0]
      jest.spyOn(Math, "random").mockImplementation(() => randoms.shift() ?? 0.5)

      await syncUser(t, "held-subject", "sh1t-lord")
      await settle(t)

      const held = await userByUsername(t, "sh1t-lord")
      const placeholder = held!.moderationHold!.placeholderUsername
      expect(placeholder).not.toBe("brisk-badger-00")
      const collisions = await t.run(
        async (ctx) =>
          await ctx.db
            .query("users")
            .withIndex("by_username_normalized", (q) =>
              q.eq("usernameNormalized", placeholder.toLowerCase()),
            )
            .collect(),
      )
      expect(collisions).toHaveLength(0)
      jest.spyOn(Math, "random").mockRestore()
    })
  })

  describe("what a report does beyond the report row", () => {
    it("keeps the reporter and the reported player out of the same lobby afterwards", async () => {
      const t = convexTest(schema, modules)
      const { host, guest, token } = await seatedGame(t, ["host-handle", "guest-handle"])
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      await reportGuest(host, guestSeat.playerId as Id<"gamePlayers">)
      await settle(t)
      await t.run(async (ctx) => {
        const seat = await ctx.db.get(guestSeat.playerId as Id<"gamePlayers">)
        if (seat) await ctx.db.delete(seat._id)
      })

      await expect(
        guest.mutation(api.games.claimSeat, {
          token,
          displayName: "Guest Realname",
          color: "#2563EB",
          deviceId: "device-guest-001",
        }),
      ).rejects.toThrow(/blocked/)
    })

    it("does not hold a name on one report alone when the filter is clean", async () => {
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      const result = await reportGuest(host, guestSeat.playerId as Id<"gamePlayers">)
      await settle(t)

      expect(result.held).toBe(false)
      const reported = await userByUsername(t, "guest-handle")
      expect(reported?.moderationHold).toBeUndefined()
    })
  })

  describe("operator resolution", () => {
    it("leaves a filter hold in place when an unrelated report is dismissed", async () => {
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "sh1t-lord"])
      await settle(t)
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      await host.mutation(api.moderation.reportPlayer, {
        publicId: PUBLIC_ID,
        playerId: guestSeat.playerId as Id<"gamePlayers">,
        reason: "harassment",
        note: "unfounded, the operator will dismiss this",
      })
      await settle(t)
      const open = await t.query(internal.moderation.openReports, {})

      await t.mutation(internal.moderation.dismissReport, {
        reportId: open[0].reportId,
        note: "no harassment took place",
      })
      await settle(t)

      // The harassment claim was unfounded; the username still trips the filter, so it stays held.
      const reported = await userByUsername(t, "sh1t-lord")
      expect(reported?.moderationHold?.reason).toBe("filter")
    })

    it("keeps an upheld hold after every report is resolved", async () => {
      const t = convexTest(schema, modules)
      const { host } = await seatedGame(t, ["host-handle", "guest-handle"])
      const guestSeat = await seatOf(host, "device-host-0001", 2)
      await reportGuest(host, guestSeat.playerId as Id<"gamePlayers">)
      await settle(t)
      const open = await t.query(internal.moderation.openReports, {})
      await t.mutation(internal.moderation.upholdReport, { reportId: open[0].reportId })
      await settle(t)

      const held = await userByUsername(t, "guest-handle")
      expect(held?.moderationHold?.reason).toBe("operator")
      expect(await t.query(internal.moderation.openReports, {})).toHaveLength(0)
    })
  })
})
