import { makeConvexTest, signedIn } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import { versionFingerprint } from "./lib/deckKeys"
import { sharedDeckVersion } from "./lib/deckShares"
import fabCube from "./lib/games/fixtures/fabCube.json"
import { hashSeatPassToken } from "./lib/seatPass"

async function syncedFab() {
  jest.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify(fabCube)))
  const t = makeConvexTest()
  await t.action(internal.cardDatasetSync.sync, { game: "fab" })
  return t
}

type Harness = Awaited<ReturnType<typeof syncedFab>>
type Actor = Awaited<ReturnType<typeof signedIn>>

async function auroraDeck(actor: Actor) {
  const imported = await actor.action(api.deckImports.resolvePasted, {
    game: "fab",
    list: "3x Snatch (red)\nHero: Aurora, Shooting Star",
  })
  const deckId = await actor.mutation(api.decks.importResolved, {
    name: "Aurora",
    game: "fab",
    format: "cc",
    cards: imported.cards,
  })
  const versionId = (await actor.query(api.decks.detail, { deckId })).versions[0]._id
  return { deckId, versionId }
}

async function fabLobby(host: Actor, joiner: Actor, publicId: string, invite: string) {
  const created = await host.mutation(api.games.createLobby, {
    publicId,
    playerCount: 2,
    startingLife: 20,
    ruleset: "cc",
    system: "fab",
    format: "cc",
    deckRequired: true,
    inviteToken: invite.repeat(43),
    manualCodeCandidates: [`${invite.toUpperCase()}AB234`.slice(0, 6)],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
  })
  await joiner.mutation(api.games.claimSeat, {
    token: invite.repeat(43),
    displayName: "Joiner",
    color: "#2563EB",
    systems: ["fab"],
  })
  return created.publicId
}

const viewerFingerprint = (t: Harness, token: string) =>
  t.run(async (ctx) => {
    const found = await sharedDeckVersion(ctx, token)
    return versionFingerprint(ctx, found!.version._id, "fab")
  })

const stored = (t: Harness) =>
  t.run(async (ctx) => ({
    players: await ctx.db.query("gamePlayers").collect(),
    summaries: await ctx.db.query("gameSummaries").collect(),
    results: await ctx.db.query("deckResults").collect(),
    versionStats: await ctx.db.query("deckVersionStats").collect(),
  }))

describe("shared decks in connected lobbies", () => {
  it("seats a shared deck by its key and list, never the owner's deck", async () => {
    const t = await syncedFab()
    const owner = await signedIn(t, "shared-seat-owner")
    const viewer = await signedIn(t, "shared-seat-viewer")
    const shared = await auroraDeck(owner)
    const { token } = await owner.mutation(api.decks.share, { deckId: shared.deckId })
    const deckKey = (await viewer.query(api.decks.shared, { token }))!.deckKey
    const ownerDeckKey = (await owner.query(api.decks.detail, { deckId: shared.deckId })).deck
      .deckKey
    const hostDeck = await auroraDeck(viewer)

    const publicId = await fabLobby(viewer, owner, "shared-seat-public-1234", "s")
    await viewer.mutation(api.decks.selectForSeat, {
      publicId,
      seat: 1,
      deckVersionId: hostDeck.versionId,
    })
    await expect(
      viewer.mutation(api.decks.selectForSeat, { publicId, seat: 1, shareToken: token }),
    ).resolves.toEqual({ deckId: null, deckVersionId: null, deckKey })
    const ownerOther = await auroraDeck(owner)
    await owner.mutation(api.decks.selectForSeat, {
      publicId,
      seat: 2,
      deckVersionId: ownerOther.versionId,
    })
    const lobby = await viewer.query(api.games.lobbyProjection, { publicId })
    expect(lobby.players.find(({ seat }) => seat === 1)?.deckVersionId).toBe(deckKey)

    await viewer.mutation(api.games.startGame, { publicId })
    const started = await viewer.query(api.games.lobbyProjection, { publicId })
    expect(started.players.find(({ seat }) => seat === 1)?.currentLife).toBe(40)
    await viewer.mutation(api.games.finishGame, { publicId })

    const after = await stored(t)
    const seat = after.players.find((player) => player.seat === 1)!
    expect(seat).toMatchObject({ deckKey, deckLabel: { name: "Aurora" } })
    expect(seat.deckVersionId).toBeUndefined()
    expect(after.summaries[0].players.find((player) => player.seat === 1)).toMatchObject({
      deckKey,
      deckNameAtFinish: "Aurora",
    })
    expect(after.results.filter((result) => result.deckKey === deckKey)).toHaveLength(1)
    expect(after.versionStats.map((row) => row.deckVersionId)).not.toContain(shared.versionId)
    const serialized = JSON.stringify(after)
    expect(serialized).not.toContain(token)
    expect(JSON.stringify([seat, after.summaries[0].players[0]])).not.toContain(ownerDeckKey)
  })

  it("rejects a stale token, two decks at once, and a deck for another game", async () => {
    const t = await syncedFab()
    const owner = await signedIn(t, "shared-reject-owner")
    const viewer = await signedIn(t, "shared-reject-viewer")
    const shared = await auroraDeck(owner)
    const { token } = await owner.mutation(api.decks.share, { deckId: shared.deckId })
    const publicId = await fabLobby(viewer, owner, "shared-reject-public-12", "r")

    await expect(
      viewer.mutation(api.decks.selectForSeat, {
        publicId,
        seat: 1,
        shareToken: token,
        deckVersionId: shared.versionId,
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_deck_selection" } })
    await expect(
      viewer.mutation(api.decks.selectForSeat, { publicId, seat: 1, shareToken: "x".repeat(43) }),
    ).rejects.toMatchObject({ data: { code: "shared_deck_not_found" } })

    const other = await signedIn(t, "shared-reject-other")
    const commander = await other.mutation(api.games.createLobby, {
      publicId: "shared-reject-commander-1",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken: "c".repeat(43),
      manualCodeCandidates: ["CMD234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
    })
    await expect(
      other.mutation(api.decks.selectForSeat, {
        publicId: commander.publicId,
        seat: 1,
        shareToken: token,
      }),
    ).rejects.toMatchObject({ data: { code: "deck_system_mismatch" } })

    await owner.mutation(api.decks.unshare, { deckId: shared.deckId })
    await expect(
      viewer.mutation(api.decks.selectForSeat, { publicId, seat: 1, shareToken: token }),
    ).rejects.toMatchObject({ data: { code: "shared_deck_not_found" } })
  })

  it("seats the owner's own deck when they use their own link", async () => {
    const t = await syncedFab()
    const owner = await signedIn(t, "shared-self-owner")
    const joiner = await signedIn(t, "shared-self-joiner")
    const shared = await auroraDeck(owner)
    const { token } = await owner.mutation(api.decks.share, { deckId: shared.deckId })
    const publicId = await fabLobby(owner, joiner, "shared-self-public-1234", "o")
    await expect(
      owner.mutation(api.decks.selectForSeat, { publicId, seat: 1, shareToken: token }),
    ).resolves.toEqual({ deckId: shared.deckId, deckVersionId: shared.versionId })
  })

  it("files a nearby claim under the shared key, or with no deck when the link is gone", async () => {
    const t = await syncedFab()
    const owner = await signedIn(t, "shared-nearby-owner")
    const host = await signedIn(t, "shared-nearby-host")
    const guest = await signedIn(t, "shared-nearby-guest")
    const shared = await auroraDeck(owner)
    const { token } = await owner.mutation(api.decks.share, { deckId: shared.deckId })
    const deckKey = (await guest.query(api.decks.shared, { token }))!.deckKey
    const publish = async (publicId: string, seatToken: string) =>
      host.mutation(api.games.publishFinishedLocalGame, {
        publicId,
        system: "fab",
        format: "cc",
        ruleset: "cc",
        startingLife: 40,
        startedAt: 1_700_000_000_000,
        finishedAt: 1_700_000_060_000,
        eventCount: 1,
        players: [
          {
            localId: "host",
            seat: 1,
            displayName: "Host",
            color: "#7C3AED",
            currentLife: 30,
            me: true,
          },
          {
            localId: "guest",
            seat: 2,
            displayName: "Guest",
            color: "#2563EB",
            currentLife: 0,
            seatPassHash: await hashSeatPassToken(seatToken),
          },
        ],
        result: { kind: "win", winnerLocalIds: ["host"] },
      })

    const fingerprint = await viewerFingerprint(t, token)
    await publish("lan_0123456789abcdef0123456789abcdef-1", "seat_one")
    await guest.mutation(api.games.claimNearbySeat, {
      publicId: "lan_0123456789abcdef0123456789abcdef-1",
      token: "seat_one",
      deckShareToken: token,
      deckFingerprint: fingerprint,
    })
    let after = await stored(t)
    expect(after.results.filter((result) => result.deckKey === deckKey)).toHaveLength(1)
    expect(JSON.stringify(after)).not.toContain(token)

    const edited = await owner.action(api.deckImports.resolvePasted, {
      game: "fab",
      list: "2x Snatch (red)\nHero: Aurora, Shooting Star",
    })
    await owner.mutation(api.decks.saveVersion, { deckId: shared.deckId, cards: edited.cards })
    await publish("lan_0123456789abcdef0123456789abcdef-3", "seat_three")
    await guest.mutation(api.games.claimNearbySeat, {
      publicId: "lan_0123456789abcdef0123456789abcdef-3",
      token: "seat_three",
      deckShareToken: token,
      deckFingerprint: fingerprint,
    })
    after = await stored(t)
    expect(after.results.filter((result) => result.deckKey === deckKey)).toHaveLength(1)

    await owner.mutation(api.decks.unshare, { deckId: shared.deckId })
    await publish("lan_0123456789abcdef0123456789abcdef-2", "seat_two")
    await expect(
      guest.mutation(api.games.claimNearbySeat, {
        publicId: "lan_0123456789abcdef0123456789abcdef-2",
        token: "seat_two",
        deckShareToken: token,
      }),
    ).resolves.toEqual({ status: "claimed" })
    after = await stored(t)
    expect(after.results.filter((result) => result.deckKey === deckKey)).toHaveLength(1)
  })
})
