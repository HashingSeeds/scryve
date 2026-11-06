import { type ConvexTestHarness, makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"
import { TABLE_VERSION } from "./lib/table"

const token = "t".repeat(43)
const publicId = "two-headed-giant-game-0001"
const variants = ["treachery", "twoHeadedGiant"]

async function teamLobby(t: ConvexTestHarness) {
  const host = await signedIn(t, "host-subject", "Host")
  await host.mutation(api.games.createLobby, {
    publicId,
    playerCount: 4,
    startingLife: 30,
    ruleset: "limited",
    system: "mtg",
    format: "limited",
    variant: "twoHeadedGiant",
    inviteToken: token,
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  return host
}

async function teamGame(t: ConvexTestHarness, beforeStart?: (host: Client) => Promise<void>) {
  const host = await teamLobby(t)
  const clients = [host]
  for (const [index, color] of ["#2563EB", "#16A34A", "#DC2626"].entries()) {
    const client = await signedIn(t, `player-${index}`, `Player ${index}`)
    await client.mutation(api.games.claimSeat, {
      token,
      displayName: `Player ${index}`,
      color,
      deviceId: `device-player-${index}`,
      variants,
    })
    clients.push(client)
  }
  await beforeStart?.(host)
  await host.mutation(api.games.startGame, { publicId })
  const projection = await host.query(api.games.lobbyProjection, {
    publicId,
    tableVersion: TABLE_VERSION,
  })
  const ids = projection.players.map(({ playerId }) => playerId)
  return { clients, ids }
}

type Client = Awaited<ReturnType<typeof signedIn>>

const write = (operationId: string, deviceId: string) => ({
  publicId,
  operationId,
  deviceId,
  clientCreatedAt: 1_700_000_000_000,
})

async function lives(client: Awaited<ReturnType<typeof signedIn>>) {
  const projection = await client.query(api.games.lobbyProjection, {
    publicId,
    tableVersion: TABLE_VERSION,
  })
  return {
    lives: projection.players.map(({ currentLife }) => currentLife),
    poison: projection.players.map(
      ({ playerId }) => projection.table?.players[playerId]?.counters?.poison ?? 0,
    ),
    groups: projection.table?.turnGroups,
  }
}

describe("Two-Headed Giant", () => {
  it("keeps installed clients that can't play it out of its games", async () => {
    const t = makeConvexTest()
    await teamLobby(t)
    const old = await signedIn(t, "old-client", "Old")
    const join = { token, displayName: "Old", color: "#2563EB", deviceId: "device-old-0001" }
    await expect(
      old.mutation(api.games.claimSeat, { ...join, variants: ["treachery"] }),
    ).rejects.toMatchObject({ data: { code: "update_required" } })
    const host = await signedIn(t, "host-subject", "Host")
    const listed = (variantsSent?: string[]) =>
      host.query(api.games.activeConnectedGames, {
        paginationOpts: { numItems: 10, cursor: null },
        ...(variantsSent ? { variants: variantsSent } : {}),
      })
    expect((await listed()).page).toHaveLength(0)
    expect((await listed(variants)).page).toHaveLength(1)
    await expect(
      host.mutation(api.games.updateLobbySettings, { publicId, playerCount: 5 }),
    ).rejects.toThrow("even number")
  })

  it("teams neighboring seats and shares life and poison from either head's device", async () => {
    const t = makeConvexTest()
    const {
      clients: [host, teammate],
      ids,
    } = await teamGame(t)
    expect((await lives(host)).groups).toEqual([ids.slice(0, 2), ids.slice(2)])

    await teammate.mutation(api.games.changeLife, {
      ...write("team-life-operation-0001", "device-player-0"),
      playerId: ids[1],
      delta: -7,
    })
    await host.mutation(api.games.tableAction, {
      ...write("team-poison-operation-0001", "device-host-0001"),
      action: { kind: "counter.changed", playerId: ids[0], counterId: "poison", delta: 3 },
    })
    expect(await lives(host)).toMatchObject({
      lives: [23, 23, 30, 30],
      poison: [3, 3, 0, 0],
    })
  })

  it("lets the host trade seats in the lobby, which changes the teams", async () => {
    const t = makeConvexTest()
    const { clients, ids } = await teamGame(t, async (host) => {
      await host.mutation(api.games.swapLobbySeats, { publicId, first: 2, second: 3 })
    })
    const ownSeat = async (client: Client) =>
      (await client.query(api.games.lobbyProjection, { publicId })).players.find(
        ({ controlledByMe }) => controlledByMe,
      )?.seat
    expect(await Promise.all(clients.map(ownSeat))).toEqual([1, 3, 2, 4])
    expect((await lives(clients[0])).groups).toEqual([ids.slice(0, 2), ids.slice(2)])
    await expect(
      clients[1].mutation(api.games.swapLobbySeats, { publicId, first: 1, second: 2 }),
    ).rejects.toThrow()
  })
})
