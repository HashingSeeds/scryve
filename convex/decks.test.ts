import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./deckCatalogs.ts": async () => jest.requireActual("./deckCatalogs"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const inviteToken = "t".repeat(43)
const hostDeviceId = "device-host-0001"

async function synced(t: ReturnType<typeof convexTest>, subject: string, name: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: name })
  return actor
}

describe("premium deck tracking", () => {
  it("creates an imported deck and its first version atomically", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "import-owner", "Import Owner")
    const deckId = await actor.mutation(api.decks.importResolved, {
      name: "Imported Commander",
      format: "commander",
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Imported Card",
          imageUrl: "https://cards.scryfall.io/example.jpg",
          smallImageUrl: "https://cards.scryfall.io/small/example.jpg",
          quantity: 1,
          board: "commander",
        },
      ],
    })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      deck: { name: "Imported Commander", format: "commander" },
      version: { versionNumber: 1 },
      cards: [
        {
          name: "Imported Card",
          board: "commander",
          quantity: 1,
          imageUrl: "https://cards.scryfall.io/example.jpg",
          smallImageUrl: "https://cards.scryfall.io/small/example.jpg",
        },
      ],
    })
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      decks: [{ coverImageUrl: "https://cards.scryfall.io/small/example.jpg" }],
    })
  })

  it("imports a Yu-Gi-Oh! catalog deck without crossing system identities", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "catalog-owner", "Catalog Owner")
    const catalogDeckId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("deckCatalogs", {
        game: "ygo",
        source: "ygoprodeck-decks",
        externalId: "catalog-example",
        kind: "top",
        name: "Catalog Example",
        format: "advanced",
        fetchedAt: Date.now(),
      })
      await ctx.db.insert("deckCatalogCards", {
        catalogDeckId: id,
        game: "ygo",
        identityNamespace: "ygoprodeck-card",
        cardId: "46986414",
        providerCardId: "46986414",
        printingId: "46986414",
        name: "Dark Magician",
        quantity: 3,
        section: "main",
        entryKind: "card",
        originalReference: "46986414",
      })
      return id
    })

    const deckId = await actor.mutation(api.decks.importCatalog, { catalogDeckId })

    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      deck: { game: "ygo", format: "advanced", name: "Catalog Example" },
      cards: [
        {
          game: "ygo",
          identityNamespace: "ygoprodeck-card",
          cardId: "46986414",
          section: "main",
          name: "Dark Magician",
          quantity: 3,
        },
      ],
    })
  })

  it("blocks imports immediately when the legal release state is disabled", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "gated-owner", "Gated Owner")
    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "ygo",
      capability: "deckImport",
      release: "disabled",
      note: "Preview gate test",
    })

    await expect(
      actor.mutation(api.decks.importResolved, {
        name: "Gated deck",
        game: "ygo",
        format: "advanced",
        cards: [
          {
            game: "ygo",
            identityNamespace: "ygoprodeck-card",
            cardId: "46986414",
            providerCardId: "46986414",
            printingId: "46986414",
            section: "main",
            entryKind: "card",
            originalReference: "46986414",
            name: "Dark Magician",
            quantity: 1,
          },
        ],
      }),
    ).rejects.toMatchObject({ data: { code: "capability_unavailable" } })
  })

  it("keeps card text available while an image release gate is disabled", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "image-gate-owner", "Image Gate Owner")
    const catalogDeckId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("deckCatalogs", {
        game: "ygo",
        source: "ygoprodeck-decks",
        externalId: "image-gate-example",
        kind: "top",
        name: "Text-only Example",
        format: "advanced",
        fetchedAt: Date.now(),
      })
      await ctx.db.insert("deckCatalogCards", {
        catalogDeckId: id,
        game: "ygo",
        cardId: "46986414",
        name: "Dark Magician",
        quantity: 3,
        section: "main",
        entryKind: "card",
        imageUrl: "https://example.test/card.jpg",
        smallImageUrl: "https://example.test/card-small.jpg",
      })
      return id
    })
    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "ygo",
      capability: "images",
      release: "disabled",
      note: "Preview gate test",
    })

    await expect(t.query(api.deckCatalogs.detail, { catalogDeckId })).resolves.toMatchObject({
      entries: [{ name: "Dark Magician" }],
    })
    const catalog = await t.query(api.deckCatalogs.detail, { catalogDeckId })
    expect(catalog.entries[0].imageUrl).toBeUndefined()
    expect(catalog.entries[0].smallImageUrl).toBeUndefined()

    const deckId = await actor.mutation(api.decks.importCatalog, { catalogDeckId })
    const detail = await actor.query(api.decks.detail, { deckId })
    expect(detail.cards[0]).not.toHaveProperty("imageUrl")
    expect(detail.cards[0]).not.toHaveProperty("smallImageUrl")
    const decks = await actor.query(api.decks.listMine)
    expect(decks.decks[0]).not.toHaveProperty("coverImageUrl")
  })

  it("blocks Top Deck provider actions behind the example-decks release gate", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "feed-gate-owner", "Feed Gate Owner")
    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "ygo",
      capability: "exampleDecks",
      release: "permission_required",
      note: "Registration pending",
    })

    await expect(
      actor.action(api.deckCatalogs.searchTopDecks, { game: "ygo", query: "" }),
    ).rejects.toMatchObject({ data: { code: "capability_unavailable" } })
  })

  it("keeps one deck free and unlocks additional decks through server entitlements", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "deck-owner", "Deck Owner")
    await expect(
      actor.mutation(api.decks.create, { name: "First", format: "commander" }),
    ).resolves.toBeDefined()
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      capacity: { used: 1, limit: 1, premium: false, canCreate: false },
    })
    await expect(
      actor.mutation(api.decks.create, { name: "Second", format: "commander" }),
    ).rejects.toMatchObject({
      data: { code: "deck_limit_reached", message: "Premium is required for additional decks" },
    })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "deck-owner",
      feature: "unlimited_decks",
      enabled: true,
      source: "test",
    })
    await expect(
      actor.mutation(api.decks.create, { name: "Second", format: "commander" }),
    ).resolves.toBeDefined()
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      decks: [{ game: "mtg" }, { game: "mtg" }],
      capacity: { used: 2, premium: true, canCreate: true },
    })
  })

  it("frees capacity when a deck is deleted and refuses further edits", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "archive-owner", "Archive Owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Retired", format: "commander" })
    await expect(actor.mutation(api.decks.archive, { deckId })).resolves.toBeNull()
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      decks: [],
      capacity: { used: 0, canCreate: true },
    })
    await expect(actor.mutation(api.decks.archive, { deckId })).rejects.toMatchObject({
      data: { code: "deck_already_archived" },
    })
    await expect(
      actor.mutation(api.decks.saveVersion, {
        deckId,
        cards: [
          {
            oracleId: "11111111-1111-1111-1111-111111111111",
            scryfallId: "22222222-2222-2222-2222-222222222222",
            name: "Retired Card",
            quantity: 1,
            board: "commander",
          },
        ],
      }),
    ).rejects.toMatchObject({ data: { code: "deck_archived" } })
  })

  it("snapshots a selected deck version and records an explicit winning result", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host", "Host")
    const joiner = await synced(t, "joiner", "Joiner")
    const deckId = await host.mutation(api.decks.create, { name: "Dragons", format: "commander" })
    const deckVersionId = await host.mutation(api.decks.saveVersion, {
      deckId,
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Dragon Test Card",
          quantity: 1,
          board: "commander",
        },
      ],
    })
    const created = await host.mutation(api.games.createLobby, {
      publicId: "deck-game-public-1234",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken,
      manualCodeCandidates: ["ABC234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: hostDeviceId,
    })
    await joiner.mutation(api.games.claimSeat, {
      token: inviteToken,
      displayName: "Joiner",
      color: "#2563EB",
    })
    await host.mutation(api.decks.selectForSeat, {
      publicId: created.publicId,
      seat: 1,
      deckVersionId,
    })
    const lobby = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDeviceId,
    })
    const hostPlayer = lobby.players.find((player) => player.seat === 1)!
    await host.mutation(api.games.startGame, { publicId: created.publicId })
    await host.mutation(api.games.finishGame, {
      publicId: created.publicId,
      result: { kind: "win", winnerPlayerIds: [hostPlayer.playerId] },
    })
    const summary = await host.query(api.games.connectedSummary, { publicId: created.publicId })
    expect(summary?.players.find((player) => player.seat === 1)).toMatchObject({
      deckId,
      deckVersionId,
      deckNameAtFinish: "Dragons",
      deckVersionNumber: 1,
      outcome: "win",
    })
    expect(summary?.players.find((player) => player.seat === 2)?.outcome).toBe("loss")
    await expect(host.query(api.decks.stats, { deckId })).resolves.toEqual({ locked: true })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "host",
      feature: "deck_analytics",
      enabled: true,
      source: "test",
    })
    await expect(host.query(api.decks.stats, { deckId })).resolves.toMatchObject({
      locked: false,
      games: 1,
      wins: 1,
      losses: 0,
      byVersion: [{ deckVersionId, versionNumber: 1, games: 1, wins: 1, losses: 0 }],
    })
    await expect(host.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      record: { games: 1, wins: 1 },
      versions: [{ record: { games: 1, wins: 1 } }],
    })
  })

  it("drops a seat selection whose version was deleted before the game started", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "stale-host", "Host")
    const joiner = await synced(t, "stale-joiner", "Joiner")
    const deckId = await host.mutation(api.decks.create, { name: "Goblins", format: "commander" })
    const firstVersionId = await host.mutation(api.decks.saveVersion, {
      deckId,
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Goblin Test Card",
          quantity: 1,
          board: "commander",
        },
      ],
    })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "stale-host",
      feature: "deck_versions",
      enabled: true,
      source: "test",
    })
    await host.mutation(api.decks.createVersion, { deckId, name: "Version 2" })
    const created = await host.mutation(api.games.createLobby, {
      publicId: "stale-deck-public-1234",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken,
      manualCodeCandidates: ["ABC235"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: hostDeviceId,
    })
    await joiner.mutation(api.games.claimSeat, {
      token: inviteToken,
      displayName: "Joiner",
      color: "#2563EB",
    })
    await host.mutation(api.decks.selectForSeat, {
      publicId: created.publicId,
      seat: 1,
      deckVersionId: firstVersionId,
    })
    await host.mutation(api.decks.deleteVersion, { versionId: firstVersionId })

    const lobby = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDeviceId,
    })
    const hostPlayer = lobby.players.find((player) => player.seat === 1)!
    await host.mutation(api.games.startGame, { publicId: created.publicId })
    await host.mutation(api.games.finishGame, {
      publicId: created.publicId,
      result: { kind: "win", winnerPlayerIds: [hostPlayer.playerId] },
    })

    const summary = await host.query(api.games.connectedSummary, { publicId: created.publicId })
    expect(summary?.players.find((player) => player.seat === 1)?.deckVersionId).toBeUndefined()
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "stale-host",
      feature: "deck_analytics",
      enabled: true,
      source: "test",
    })
    await expect(host.query(api.decks.stats, { deckId })).resolves.toMatchObject({
      locked: false,
      games: 0,
    })
  })

  it("drops a seat selection whose deck was deleted before the game started", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "archived-host", "Host")
    const joiner = await synced(t, "archived-joiner", "Joiner")
    const deckId = await host.mutation(api.decks.create, { name: "Elves", format: "commander" })
    const deckVersionId = await host.mutation(api.decks.saveVersion, {
      deckId,
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Elf Test Card",
          quantity: 1,
          board: "commander",
        },
      ],
    })
    const created = await host.mutation(api.games.createLobby, {
      publicId: "archived-deck-public-12",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken,
      manualCodeCandidates: ["ABC236"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: hostDeviceId,
    })
    await joiner.mutation(api.games.claimSeat, {
      token: inviteToken,
      displayName: "Joiner",
      color: "#2563EB",
    })
    await host.mutation(api.decks.selectForSeat, {
      publicId: created.publicId,
      seat: 1,
      deckVersionId,
    })
    await host.mutation(api.decks.archive, { deckId })

    const lobby = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDeviceId,
    })
    const hostPlayer = lobby.players.find((player) => player.seat === 1)!
    await host.mutation(api.games.startGame, { publicId: created.publicId })
    await host.mutation(api.games.finishGame, {
      publicId: created.publicId,
      result: { kind: "win", winnerPlayerIds: [hostPlayer.playerId] },
    })

    const summary = await host.query(api.games.connectedSummary, { publicId: created.publicId })
    expect(summary).not.toBeNull()
    expect(summary?.players.find((player) => player.seat === 1)?.deckVersionId).toBeUndefined()
  })

  it("accepts authoritative Clerk username projections", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.users.syncFromClerk, {
      clerkUserId: "clerk-user",
      displayName: "Ada Lovelace",
      username: "ada_lovelace",
      avatarUrl: "https://example.test/ada.png",
    })
    const user = await t.run(
      async (ctx) =>
        await ctx.db
          .query("users")
          .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "clerk-user"))
          .unique(),
    )
    expect(user).toMatchObject({
      displayName: "Ada Lovelace",
      username: "ada_lovelace",
      usernameNormalized: "ada_lovelace",
    })
  })

  it("limits free history while preserving older games for a later premium unlock", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "history-owner", "History Owner")
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "history-owner"))
        .unique()
      for (let index = 0; index < 11; index += 1) {
        const gameId = await ctx.db.insert("games", {
          publicId: `history-game-${String(index).padStart(16, "0")}`,
          hostUserId: user!._id,
          mode: "connected",
          status: "finished",
          playerCount: 2,
          startingLife: 20,
          ruleset: "standard",
          createdAt: index,
          updatedAt: index,
        })
        const summaryId = await ctx.db.insert("gameSummaries", {
          gameId,
          publicId: `history-game-${String(index).padStart(16, "0")}`,
          terminalStatus: "finished",
          startingLife: 20,
          ruleset: "standard",
          eventCount: 0,
          finishedAt: index,
          players: [],
        })
        await ctx.db.insert("gameHistoryEntries", {
          userId: user!._id,
          gameId,
          summaryId,
          finishedAt: index,
          outcome: "unknown",
        })
      }
    })
    const freeHistory = await actor.query(api.games.connectedHistory, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(freeHistory.page).toHaveLength(10)
    expect(freeHistory).toMatchObject({ premium: false, hasLockedHistory: true, isDone: true })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "history-owner",
      feature: "full_history",
      enabled: true,
      source: "test",
    })
    const premiumHistory = await actor.query(api.games.connectedHistory, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(premiumHistory.page).toHaveLength(11)
    expect(premiumHistory).toMatchObject({ premium: true, hasLockedHistory: false, isDone: true })
  })
})

function uuid(seed: string) {
  return `${seed.padEnd(8, "0").slice(0, 8)}-0000-0000-0000-000000000000`
}

function testCard(name: string, seed: string, board: "main" | "sideboard" | "commander" = "main") {
  return {
    oracleId: uuid(seed),
    scryfallId: uuid(`${seed}f`),
    name,
    quantity: 1,
    board,
  }
}

async function premiumVersions(t: ReturnType<typeof convexTest>, clerkUserId: string) {
  await t.mutation(internal.entitlements.setUserFeature, {
    clerkUserId,
    feature: "deck_versions",
    enabled: true,
    source: "test",
  })
}

describe("deck versions", () => {
  it("gives every new deck one named version slot", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "slot-owner", "Slot Owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Slots", format: "commander" })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      versions: [{ versionNumber: 1, name: "Current", cardCount: 0 }],
      capacity: { used: 1, limit: 1, premium: false, canCreate: false },
    })
  })

  it("edits a version in place instead of appending history", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "edit-owner", "Edit Owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Edits", format: "commander" })
    const first = await actor.mutation(api.decks.saveVersion, {
      deckId,
      cards: [testCard("First Card", "aaaaaaa1")],
    })
    const second = await actor.mutation(api.decks.saveVersion, {
      deckId,
      cards: [testCard("First Card", "aaaaaaa1"), testCard("Second Card", "aaaaaaa2")],
    })
    expect(second).toBe(first)
    const detail = await actor.query(api.decks.detail, { deckId })
    expect(detail.versions).toHaveLength(1)
    expect(detail.versions[0]).toMatchObject({ versionNumber: 1, cardCount: 2, cardQuantity: 2 })
    expect(detail.cards).toHaveLength(2)
  })

  it("keeps extra version slots premium and caps them at five", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "version-owner", "Version Owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Tuning", format: "commander" })
    await expect(
      actor.mutation(api.decks.createVersion, { deckId, name: "vs Control" }),
    ).rejects.toMatchObject({
      data: {
        code: "version_limit_reached",
        message: "Premium is required for extra deck versions",
      },
    })
    await premiumVersions(t, "version-owner")
    for (const name of ["vs Control", "vs Aggro", "Budget", "Spicy"])
      await expect(actor.mutation(api.decks.createVersion, { deckId, name })).resolves.toBeDefined()
    await expect(
      actor.mutation(api.decks.createVersion, { deckId, name: "One too many" }),
    ).rejects.toMatchObject({ data: { code: "version_limit_reached" } })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      capacity: { used: 5, limit: 5, premium: true, canCreate: false },
    })
  })

  it("seeds a new version from the version it was branched off", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "branch-owner", "Branch Owner")
    await premiumVersions(t, "branch-owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Branch", format: "commander" })
    const mainVersionId = await actor.mutation(api.decks.saveVersion, {
      deckId,
      cards: [testCard("Shared Card", "bbbbbbb1")],
    })
    const branchId = await actor.mutation(api.decks.createVersion, {
      deckId,
      fromVersionId: mainVersionId,
      name: "vs Control",
      note: "Swapping in the sweepers",
    })
    const branch = await actor.query(api.decks.detail, { deckId, versionId: branchId })
    expect(branch.version?._id).toBe(branchId)
    expect(branch.cards).toMatchObject([{ name: "Shared Card" }])
    expect(branch.versions.find((version) => version._id === branchId)).toMatchObject({
      name: "vs Control",
      note: "Swapping in the sweepers",
      versionNumber: 2,
    })
    await actor.mutation(api.decks.saveVersion, {
      deckId,
      versionId: branchId,
      cards: [testCard("Shared Card", "bbbbbbb1"), testCard("Sweeper", "bbbbbbb2", "sideboard")],
    })
    await expect(
      actor.query(api.decks.detail, { deckId, versionId: mainVersionId }),
    ).resolves.toMatchObject({
      cards: [{ name: "Shared Card" }],
    })
  })

  it("archives a version without disturbing the last one standing", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "prune-owner", "Prune Owner")
    await premiumVersions(t, "prune-owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Prune", format: "commander" })
    const extraId = await actor.mutation(api.decks.createVersion, { deckId, name: "Experiment" })
    await expect(
      actor.mutation(api.decks.deleteVersion, { versionId: extraId }),
    ).resolves.toBeNull()
    const detail = await actor.query(api.decks.detail, { deckId })
    expect(detail.versions).toHaveLength(1)
    await expect(
      actor.mutation(api.decks.deleteVersion, { versionId: detail.versions[0]._id }),
    ).rejects.toMatchObject({ data: { code: "last_version" } })
    await expect(
      actor.mutation(api.decks.updateVersion, { versionId: extraId, name: "Revived" }),
    ).rejects.toMatchObject({ data: { code: "deck_version_not_found" } })
  })

  it("round-trips deck and version notes", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "note-owner", "Note Owner")
    const deckId = await actor.mutation(api.decks.create, {
      name: "Notes",
      format: "commander",
      note: "Ramp into big spells",
    })
    const detail = await actor.query(api.decks.detail, { deckId })
    expect(detail.deck.note).toBe("Ramp into big spells")
    await actor.mutation(api.decks.update, { deckId, format: "modern", note: "New plan" })
    await actor.mutation(api.decks.updateVersion, {
      versionId: detail.versions[0]._id,
      name: "Sleeved list",
      note: "Cut the fast mana",
    })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      deck: { format: "modern", note: "New plan" },
      versions: [{ name: "Sleeved list", note: "Cut the fast mana" }],
    })
  })

  it("accepts released systems and rejects unknown system or format pairs", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "game-owner", "Game Owner")
    await expect(
      actor.mutation(api.decks.create, { name: "Duel", format: "advanced", game: "other" }),
    ).rejects.toMatchObject({ data: { code: "unknown_game" } })
    await expect(
      actor.mutation(api.decks.create, {
        name: "Wrong format",
        format: "advanced",
        game: "pokemon",
      }),
    ).rejects.toMatchObject({ data: { code: "unknown_format" } })
    await expect(
      actor.mutation(api.decks.create, { name: "Duel", format: "advanced", game: "ygo" }),
    ).resolves.toBeDefined()
  })
})
