import { type ConvexTestHarness, makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"
import { TABLE_VERSION } from "./lib/table"

const token = "t".repeat(43)
const publicId = "riftbound-two-vs-two-0001"
const variants = ["treachery", "twoHeadedGiant", "twoVsTwo"]

const lobbyArgs = {
  publicId,
  playerCount: 4,
  startingLife: 0,
  ruleset: "constructed",
  system: "riftbound",
  format: "constructed",
  variant: "twoVsTwo" as const,
  inviteToken: token,
  manualCodeCandidates: ["ABC234"],
  hostDisplayName: "Host",
  hostColor: "#7C3AED",
  deviceId: "device-host-0001",
}

type Client = Awaited<ReturnType<typeof signedIn>>

async function teamGame(t: ConvexTestHarness) {
  const host = await signedIn(t, "host-subject", "Host")
  await host.mutation(api.games.createLobby, lobbyArgs)
  const clients: Client[] = [host]
  for (const [index, color] of ["#2563EB", "#16A34A", "#DC2626"].entries()) {
    const client = await signedIn(t, `player-${index}`, `Player ${index}`)
    await client.mutation(api.games.claimSeat, {
      token,
      displayName: `Player ${index}`,
      color,
      deviceId: `device-player-${index}`,
      variants,
      systems: ["riftbound"],
    })
    clients.push(client)
  }
  await host.mutation(api.games.startGame, { publicId })
  const ids = (await table(host)).players.map(({ playerId }) => playerId)
  return { clients, ids }
}

const table = (client: Client) =>
  client.query(api.games.lobbyProjection, { publicId, tableVersion: TABLE_VERSION })

const write = (operationId: string, deviceId: string) => ({
  publicId,
  operationId,
  deviceId,
  clientCreatedAt: 1_700_000_000_000,
})

describe("Riftbound 2v2", () => {
  it("keeps clients that don't list it out of its games", async () => {
    const t = makeConvexTest()
    const host = await signedIn(t, "host-subject", "Host")
    await host.mutation(api.games.createLobby, lobbyArgs)
    const twoHeadedGiantBuild = await signedIn(t, "old-client", "Old")
    await expect(
      twoHeadedGiantBuild.mutation(api.games.claimSeat, {
        token,
        displayName: "Old",
        color: "#2563EB",
        deviceId: "device-old-0001",
        systems: ["riftbound"],
        variants: ["treachery", "archenemy", "twoHeadedGiant", "planechase"],
      }),
    ).rejects.toMatchObject({ data: { code: "update_required" } })
    const listed = (sent?: string[]) =>
      host.query(api.games.activeConnectedGames, {
        paginationOpts: { numItems: 10, cursor: null },
        ...(sent ? { variants: sent } : {}),
      })
    expect((await listed()).page).toHaveLength(0)
    expect((await listed(["treachery", "twoHeadedGiant"])).page).toHaveLength(0)
    expect((await listed(variants)).page).toHaveLength(1)
  })

  it("is offered only by Riftbound, and only at 4 seats", async () => {
    const host = await signedIn(makeConvexTest(), "host-subject", "Host")
    await expect(
      host.mutation(api.games.createLobby, {
        ...lobbyArgs,
        startingLife: 20,
        ruleset: "standard",
        system: "mtg",
        format: "standard",
      }),
    ).rejects.toThrow("This game doesn't offer that variant")
    await expect(
      host.mutation(api.games.createLobby, { ...lobbyArgs, playerCount: 6 }),
    ).rejects.toThrow("2v2 needs 4 seats")
  })

  it("shares points across a team, keeps XP per player, and ends the race at 11", async () => {
    const t = makeConvexTest()
    const {
      clients: [host, teammate, rival],
      ids,
    } = await teamGame(t)
    expect((await table(host)).table?.turnGroups).toEqual([ids.slice(0, 2), ids.slice(2)])

    await teammate.mutation(api.games.changeLife, {
      ...write("team-points-operation-01", "device-player-0"),
      playerId: ids[1],
      delta: 9,
    })
    await host.mutation(api.games.tableAction, {
      ...write("xp-operation-000000001", "device-host-0001"),
      action: { kind: "counter.changed", playerId: ids[0], counterId: "xp", delta: 2 },
    })
    const projection = await table(host)
    expect(projection.players.map(({ currentLife }) => currentLife)).toEqual([9, 9, 0, 0])
    expect(ids.map((id) => projection.table?.players[id]?.counters?.xp ?? 0)).toEqual([2, 0, 0, 0])

    const pass = (
      client: Client,
      deviceId: string,
      from: string,
      to: string,
      operationId: string,
    ) =>
      client.mutation(api.games.tableAction, {
        ...write(operationId, deviceId),
        action: { kind: "turn.passed", playerId: from, toPlayerId: to },
      })
    await rival.mutation(api.games.tableAction, {
      ...write("turn-claim-team-b-0001", "device-player-1"),
      action: { kind: "turn.set", playerId: ids[2], toPlayerId: ids[2] },
    })
    await pass(rival, "device-player-1", ids[2], ids[0], "turn-pass-team-b-00001")
    // why: at 9 points a race to 8 would have put team B out, so this pass would have nowhere to go.
    await pass(host, "device-host-0001", ids[0], ids[2], "turn-pass-team-a-00001")
    expect((await table(host)).table?.turn).toMatchObject({ playerId: ids[2], number: 3 })

    await pass(rival, "device-player-1", ids[2], ids[0], "turn-pass-team-b-00002")
    await teammate.mutation(api.games.changeLife, {
      ...write("team-points-operation-02", "device-player-0"),
      playerId: ids[1],
      delta: 2,
    })
    expect((await table(host)).players.map(({ currentLife }) => currentLife)).toEqual([
      11, 11, 0, 0,
    ])
    await expect(
      pass(host, "device-host-0001", ids[0], ids[2], "turn-pass-team-a-00002"),
    ).rejects.toThrow()
  })
})
