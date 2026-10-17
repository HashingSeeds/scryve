import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import fabCube from "./lib/games/fixtures/fabCube.json"

async function syncedFab() {
  jest.spyOn(global, "fetch").mockImplementation(async () => new Response(JSON.stringify(fabCube)))
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
    } finally {
      jest.useRealTimers()
    }
  })

  it("serves image fallbacks from the catalog and has no deck links or example decks", async () => {
    const actor = await player(await syncedFab(), "fab-browser")
    await expect(
      actor.action(api.deckCatalogs.browse, { game: "fab", query: "" }),
    ).resolves.toEqual({ decks: [], cursor: null, status: "unsupported" })
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
