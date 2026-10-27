import { requireHost, requireMembership, requireSeatOwner, requireUser } from "./auth"
import { makeConvexTest, type ConvexTestHarness } from "../../test/convexTest"
import { api } from "../_generated/api"

async function synced(t: ConvexTestHarness, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

describe("auth helpers", () => {
  it("reject with codes that survive production, keeping the messages installed clients match", async () => {
    const t = makeConvexTest()
    const host = await synced(t, "auth-host")
    await host.mutation(api.games.createLobby, {
      publicId: "auth-game-id-12345678",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken: "t".repeat(43),
      manualCodeCandidates: ["ABC234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: "device-host-0001",
    })
    const stranger = await synced(t, "auth-stranger")
    const game = await t.run(async (ctx) => await ctx.db.query("games").first())
    if (!game) throw new Error("lobby was not created")

    await expect(
      t.withIdentity({ subject: "auth-unsynced" }).run(requireUser),
    ).rejects.toMatchObject({
      data: {
        code: "user_not_synced",
        message: "User projection is missing; sync the signed-in user first",
      },
    })
    await expect(stranger.run((ctx) => requireMembership(ctx, game._id))).rejects.toMatchObject({
      data: { code: "game_membership_required", message: "Game membership required" },
    })
    await expect(stranger.run((ctx) => requireHost(ctx, game))).rejects.toMatchObject({
      data: { code: "host_required", message: "Host permission required" },
    })
    await expect(host.run((ctx) => requireSeatOwner(ctx, game._id, 2))).rejects.toMatchObject({
      data: { code: "seat_owner_required", message: "Seat-owner permission required" },
    })

    await t.run(async (ctx) => {
      await ctx.db.insert("accountDeletionRequests", {
        clerkUserId: "auth-stranger",
        status: "processing",
        attempts: 0,
        requestedAt: 0,
        updatedAt: 0,
      })
    })
    await expect(stranger.run(requireUser)).rejects.toMatchObject({
      data: { code: "account_deletion_in_progress", message: "Account deletion is in progress" },
    })
  })
})
