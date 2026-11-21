import { makeConvexTest, signedIn, type ConvexTestHarness } from "../test/convexTest"
import { api } from "./_generated/api"
import { gameSetupOf } from "./lib/games/setup"
import { CLIENT_VARIANTS } from "./lib/tableModes"

const token = "s".repeat(43)

const storedSetup = (t: ConvexTestHarness, publicId: string) =>
  t.run(async (ctx) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
      .unique()
    return gameSetupOf(game!)
  })

const players = ["a", "b", "c", "d"].map((letter, index) => ({
  localId: `local-${letter}`,
  seat: index + 1,
  displayName: `Player ${letter}`,
  color: "#7C3AED",
  currentLife: 30,
}))

describe("game setup", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("survives a rematch, a local publish, and connecting a local game", async () => {
    const t = makeConvexTest()
    const host = await signedIn(t, "host", "Host")

    await host.mutation(api.games.createLobby, {
      publicId: "setup-lobby-game-000001",
      playerCount: 3,
      startingLife: 40,
      lifeStep: 5,
      ruleset: "commander",
      deckRequired: false,
      system: "mtg",
      format: "commander",
      variant: "archenemy",
      modeSetup: { archenemy: { seat: 2 }, planechase: { decks: ["pc12-chaos-reigns"] } },
      layout: "even-grid",
      editsAnySeat: true,
      matchBestOf: 3,
      firstPlayerMode: "pick",
      freeMulligans: "first",
      inviteToken: token,
      manualCodeCandidates: ["SET234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: "device-host-0001",
    })
    for (const seat of [2, 3]) {
      const guest = await signedIn(t, `guest-${seat}`, `Guest ${seat}`)
      await guest.mutation(api.games.claimSeat, {
        token,
        displayName: `Guest ${seat}`,
        color: "#2563EB",
        variants: [...CLIENT_VARIANTS],
        deviceId: `device-guest-${seat}`,
        editsAnySeat: true,
      })
    }
    await host.mutation(api.games.startGame, { publicId: "setup-lobby-game-000001" })
    const played = await storedSetup(t, "setup-lobby-game-000001")
    expect(Object.values(played)).not.toContain(undefined)
    await host.mutation(api.games.finishGame, {
      publicId: "setup-lobby-game-000001",
      rematch: {
        publicId: "setup-rematch-game-0001",
        inviteToken: "r".repeat(43),
        manualCodeCandidates: ["REM234"],
      },
    })
    expect(await storedSetup(t, "setup-rematch-game-0001")).toEqual(played)

    await host.mutation(api.games.publishFinishedLocalGame, {
      publicId: "setup-finished-game-001",
      system: "mtg",
      format: "commander",
      ruleset: "commander",
      startingLife: 40,
      lifeStep: 5,
      freeMulligans: "first",
      startedAt: Date.now() - 60_000,
      finishedAt: Date.now(),
      eventCount: 3,
      players: players.slice(0, 2).map((player, index) => ({
        ...player,
        ...(index === 0 ? { me: true, mulligans: 1 } : {}),
      })),
      result: { kind: "draw" },
    })
    expect(await storedSetup(t, "setup-finished-game-001")).toEqual({
      startingLife: 40,
      lifeStep: 5,
      ruleset: "commander",
      game: "mtg",
      system: "mtg",
      format: "commander",
      freeMulligans: "first",
    })

    const other = await signedIn(t, "other-host", "Other")
    await other.mutation(api.games.publishLocalGame, {
      operationId: "setup-publish-operation-1",
      publicId: "setup-connected-game-01",
      system: "mtg",
      format: "standard",
      ruleset: "standard",
      startingLife: 30,
      lifeStep: 5,
      inviteToken: "c".repeat(43),
      manualCodeCandidates: ["CON234"],
      hostLocalId: "local-a",
      players,
      table: {
        designations: {},
        players: {},
        turnGroups: [
          ["local-a", "local-c"],
          ["local-b", "local-d"],
        ],
      },
      layout: "even-grid",
      editsAnySeat: true,
      variant: "twoHeadedGiant",
      match: {
        bestOf: 3,
        gameNumber: 1,
        gamesDrawn: 0,
        seats: players.map(({ seat }) => ({ seat, gamesWon: 0 })),
      },
    })
    expect(await storedSetup(t, "setup-connected-game-01")).toEqual({
      startingLife: 30,
      lifeStep: 5,
      ruleset: "standard",
      game: "mtg",
      system: "mtg",
      format: "standard",
      variant: "twoHeadedGiant",
      layout: "even-grid",
      lifeEditing: "anyone",
      matchBestOf: 3,
    })
  })
})
