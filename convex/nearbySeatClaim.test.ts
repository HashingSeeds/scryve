import type { FunctionArgs } from "convex/server"
import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import { hashSeatPassToken } from "./lib/seatPass"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const FINISHED_AT = 1_700_000_900_000
const PUBLIC_ID = "lan_0123456789abcdef0123456789abcdef-1"
const GUEST_TOKEN = "token_guest"
const OTHER_TOKEN = "token_other"

type PublishArgs = FunctionArgs<typeof api.games.publishFinishedLocalGame>
type Players = PublishArgs["players"]

async function synced(t: ReturnType<typeof convexTest>, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

async function nearbyGame(players?: Players): Promise<PublishArgs> {
  return {
    publicId: PUBLIC_ID,
    system: "mtg",
    format: "commander",
    ruleset: "commander",
    startingLife: 40,
    startedAt: FINISHED_AT - 60_000,
    finishedAt: FINISHED_AT,
    eventCount: 3,
    players: players ?? [
      {
        localId: "seat_host",
        seat: 1,
        displayName: "Host",
        color: "#7C3AED",
        currentLife: 30,
        me: true,
      },
      {
        localId: "seat_guest",
        seat: 2,
        displayName: "Guest",
        color: "#2563EB",
        currentLife: 0,
        seatPassHash: await hashSeatPassToken(GUEST_TOKEN),
      },
      {
        localId: "seat_other",
        seat: 3,
        displayName: "Other",
        color: "#DC2626",
        currentLife: 5,
        seatPassHash: await hashSeatPassToken(OTHER_TOKEN),
      },
    ],
    result: { kind: "win", winnerLocalIds: ["seat_host"] },
  }
}

const historyOf = (actor: Awaited<ReturnType<typeof synced>>) =>
  actor.query(api.games.connectedHistory, { paginationOpts: { numItems: 10, cursor: null } })

describe("claimNearbySeat", () => {
  it("waits for the host's upload, then files the game under the guest once", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const claim = { publicId: PUBLIC_ID, token: GUEST_TOKEN }

    await expect(guest.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "pending",
    })
    await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())
    await expect(guest.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "claimed",
    })
    await expect(guest.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "claimed",
    })

    const history = await historyOf(guest)
    expect(history.page).toHaveLength(1)
    expect(history.page[0]).toMatchObject({
      publicId: PUBLIC_ID,
      source: "local",
      outcome: "loss",
      finishedAt: FINISHED_AT,
    })
    expect((await historyOf(host)).page).toHaveLength(1)
    const summary = await t.run((ctx) =>
      ctx.db
        .query("gameSummaries")
        .withIndex("by_public_id", (q) => q.eq("publicId", PUBLIC_ID))
        .unique(),
    )
    expect(summary?.players.filter((player) => player.userId).map((player) => player.seat)).toEqual(
      [1, 2],
    )
    const opened = await guest.query(api.games.connectedSummary, { publicId: PUBLIC_ID })
    expect(opened?.publicId).toBe(PUBLIC_ID)
    await expect(
      host.query(api.games.connectedSummary, { publicId: PUBLIC_ID }),
    ).resolves.toBeTruthy()
  })

  it("refuses a wrong pass, a seat another account holds, and a second seat for one account", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const intruder = await synced(t, "intruder")
    await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())

    await expect(
      guest.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: "token_guessed" }),
    ).rejects.toThrow("not for this game")
    await guest.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: GUEST_TOKEN })
    await expect(
      intruder.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: GUEST_TOKEN }),
    ).rejects.toThrow("Another account claimed this seat")
    await expect(
      guest.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: OTHER_TOKEN }),
    ).rejects.toThrow("already hold a seat")
    await expect(
      host.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: OTHER_TOKEN }),
    ).rejects.toThrow("already hold a seat")
    expect((await historyOf(intruder)).page).toHaveLength(0)
    await expect(
      intruder.query(api.games.connectedSummary, { publicId: PUBLIC_ID }),
    ).rejects.toThrow("Game membership required")
  })

  it("rejects a pass hash on the host's own seat, a malformed hash, and a repeated hash", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const valid = await nearbyGame()
    const [mine, guest, other] = valid.players
    const hash = guest.seatPassHash!

    for (const players of [
      [{ ...mine, seatPassHash: hash }, { ...guest, seatPassHash: undefined }, other],
      [mine, { ...guest, seatPassHash: "not-a-hash" }, other],
      [mine, guest, { ...other, seatPassHash: hash }],
    ])
      await expect(
        host.mutation(api.games.publishFinishedLocalGame, await nearbyGame(players)),
      ).rejects.toThrow("Seat passes must be distinct hashes")
  })
})
