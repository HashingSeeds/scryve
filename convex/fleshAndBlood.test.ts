import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import fabPrecons from "./lib/games/fabPrecons.json"
import fabCube from "./lib/games/fixtures/fabCube.json"

async function syncedFab(dataset: unknown[] = fabCube) {
  jest.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify(dataset)))
  const t = makeConvexTest()
  await t.action(internal.cardDatasetSync.sync, { game: "fab" })
  return t
}

async function player(t: ConvexTestHarness, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

const FABRARY_LIST = [
  "Name: Aurora CC",
  "Hero: Aurora, Shooting Star",
  "Format: Classic Constructed",
  "",
  "Arena cards",
  "1x Achilles Accelerator",
  "",
  "Deck cards",
  "3x Snatch (red)",
  "2x Awakening (blue)",
  "",
  "Made with ❤️ at the FaBrary",
  "See the full deck @ https://fabrary.net/decks/01ABC",
].join("\n")

function blitzPrecon() {
  const deck = fabPrecons.find(({ format }) => format === "blitz")
  if (!deck) throw new Error("No Blitz precon")
  const pitches = new Map([
    ["red", "1"],
    ["yellow", "2"],
    ["blue", "3"],
  ])
  const printing = (id: string) => [
    { unique_id: `${id}-p`, image_url: `https://img.test/${id}.png` },
  ]
  const dataset = [
    { unique_id: deck.heroId, name: deck.hero, printings: printing("hero") },
    ...deck.cards.map((card, index) => ({
      unique_id: card.id,
      name: card.name,
      pitch: pitches.get(card.pitch ?? "") ?? "",
      printings: printing(`card-${index}`),
    })),
  ]
  return { deck, dataset }
}

describe("Flesh and Blood", () => {
  afterEach(() => jest.restoreAllMocks())

  it("imports a Fabrary card list with its hero in the hero section and each pitch as its own card", async () => {
    const actor = await player(await syncedFab(), "fab-importer")

    const result = await actor.action(api.deckImports.resolvePasted, {
      game: "fab",
      list: FABRARY_LIST,
    })

    expect(result.cards).toMatchObject([
      { name: "Aurora, Shooting Star", section: "hero", quantity: 1 },
      { name: "Achilles Accelerator", section: "arena", quantity: 1 },
      {
        name: "Snatch (red)",
        section: "main",
        quantity: 3,
        imageUrl: expect.stringMatching(/^https:\/\//),
      },
      { name: "Awakening (blue)", section: "main", quantity: 2 },
    ])
    expect(result.unresolved).toEqual([])
    expect(result.invalidLines).toEqual([])
  })

  it("starts a connected seat at its hero's life, in the rematch, and in the summary", async () => {
    jest.useFakeTimers()
    try {
      const t = await syncedFab()
      const host = await player(t, "fab-host")
      const joiner = await player(t, "fab-joiner")
      const imported = await host.action(api.deckImports.resolvePasted, {
        game: "fab",
        list: "Hero: Aurora, Shooting Star\n3x Snatch (red)",
      })
      const deckId = await host.mutation(api.decks.importResolved, {
        name: "Aurora",
        game: "fab",
        format: "cc",
        cards: imported.cards,
      })
      const deckVersionId = (await host.query(api.decks.detail, { deckId })).versions[0]._id
      await expect(host.query(api.decks.startingValue, { versionId: deckVersionId })).resolves.toBe(
        40,
      )

      const created = await host.mutation(api.games.createLobby, {
        publicId: "fab-hero-life-public-12",
        playerCount: 2,
        startingLife: 20,
        ruleset: "cc",
        system: "fab",
        format: "cc",
        inviteToken: "f".repeat(43),
        manualCodeCandidates: ["FAB234"],
        hostDisplayName: "Host",
        hostColor: "#7C3AED",
      })
      await joiner.mutation(api.games.claimSeat, {
        token: "f".repeat(43),
        displayName: "Joiner",
        color: "#2563EB",
        systems: ["fab"],
      })
      await host.mutation(api.decks.selectForSeat, {
        publicId: created.publicId,
        seat: 1,
        deckVersionId,
      })
      await host.mutation(api.games.startGame, { publicId: created.publicId })
      const lives = async (publicId: string) =>
        (await host.query(api.games.lobbyProjection, { publicId })).players.map(
          ({ seat, currentLife }) => [seat, currentLife],
        )
      expect(await lives(created.publicId)).toEqual([
        [1, 40],
        [2, 20],
      ])

      const rematch = {
        publicId: "fab-hero-life-rematch-1",
        inviteToken: "g".repeat(43),
        manualCodeCandidates: ["FAB345"],
      }
      await host.mutation(api.games.finishGame, { publicId: created.publicId, rematch })
      const summary = await host.query(api.games.connectedSummary, { publicId: created.publicId })
      expect(summary?.players.map(({ seat, startingLife }) => [seat, startingLife])).toEqual([
        [1, 40],
        [2, undefined],
      ])
      expect(await lives(rematch.publicId)).toEqual([
        [1, 40],
        [2, 20],
      ])

      await t.run(async (ctx) => {
        const hero = await ctx.db
          .query("gameCards")
          .filter((q) => q.eq(q.field("name"), "Aurora, Shooting Star"))
          .first()
        if (!hero?.facets) throw new Error("No hero card")
        await ctx.db.patch(hero._id, {
          facets: hero.facets.map((facet) =>
            facet.key === "health" ? { ...facet, value: "30" } : facet,
          ),
        })
      })
      await expect(host.query(api.decks.startingValue, { versionId: deckVersionId })).resolves.toBe(
        30,
      )
      const corrected = await host.query(api.games.connectedSummary, {
        publicId: created.publicId,
      })
      expect(corrected?.players[0]).toMatchObject({ startingLife: 40, finalLife: 40 })
    } finally {
      jest.useRealTimers()
    }
  })

  it("browses official precons by format, hero first, with their sourced counts", async () => {
    const { deck, dataset } = blitzPrecon()
    const actor = await player(await syncedFab(dataset), "fab-precons")

    const browsed = await actor.action(api.deckCatalogs.browse, {
      game: "fab",
      format: "blitz",
      query: "",
      source: "all",
    })

    expect(browsed).toMatchObject({
      status: "ready",
      decks: [{ name: deck.name, kind: "official", format: "blitz", sourceUrl: deck.sourceUrl }],
    })
    const { entries } = await actor.query(api.deckCatalogs.detail, {
      catalogDeckId: browsed.decks[0]._id,
    })
    expect(entries[0]).toMatchObject({
      name: deck.hero,
      section: "hero",
      quantity: 1,
      imageUrl: "https://img.test/hero.png",
    })
    expect(entries.slice(1).map(({ quantity }) => quantity)).toEqual(
      deck.cards.map(({ count }) => count),
    )
  })

  it("keeps a listed precon while its cards are missing from a partial sync, and drops unlisted ones", async () => {
    const { deck, dataset } = blitzPrecon()
    const t = await syncedFab(dataset)
    await t.action(internal.deckCatalogs.refresh, { game: "fab", format: "blitz" })
    await t.mutation(internal.deckCatalogs.upsert, {
      game: "fab",
      source: "legend-story-studios",
      externalId: "https://fabtcg.com/decklists/retired-precon/",
      kind: "official",
      name: "Retired precon",
      format: "blitz",
      entries: [],
    })
    await t.run(async (ctx) => {
      const card = await ctx.db
        .query("gameCards")
        .withIndex("by_game_and_identity_namespace_and_card_id", (q) =>
          q
            .eq("game", "fab")
            .eq("identityNamespace", "fab-cube-card")
            .eq("cardId", deck.cards[0].id),
        )
        .unique()
      if (!card) throw new Error("The first card was not synced")
      await ctx.db.delete(card._id)
    })
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 25 * 60 * 60 * 1000)

    await t.action(internal.deckCatalogs.refresh, { game: "fab", format: "blitz" })

    const listed = await t.run(
      async (ctx) =>
        await ctx.db
          .query("deckCatalogs")
          .withIndex("by_game_and_fetched_at", (q) => q.eq("game", "fab"))
          .take(10),
    )
    expect(listed.map(({ name }) => name)).toEqual([deck.name])
  })

  it("serves image fallbacks from the catalog and has no deck links", async () => {
    const actor = await player(await syncedFab(), "fab-browser")
    await expect(
      actor.action(api.deckImports.resolveLink, {
        game: "fab",
        url: "https://fabrary.net/decks/01ABC",
      }),
    ).rejects.toMatchObject({ data: { code: "deck_link_unsupported" } })
    await expect(
      actor.action(api.cards.imageFallbacks, { game: "fab", cardId: "PHktCwKzLmBMwmCBwb7Cw" }),
    ).resolves.toEqual([expect.stringMatching(/^https:\/\//)])
  })
})
