import { makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"
import { TABLE_VERSION } from "./lib/table"
import { CLIENT_VARIANTS } from "./lib/tableModes"

const token = "m".repeat(43)
const publicId = "public-modes-id-123456"
const variants = [...CLIENT_VARIANTS]

async function archenemyGame(seats: number) {
  const t = makeConvexTest()
  const host = await signedIn(t, "host-subject", "Host")
  await host.mutation(api.games.createLobby, {
    publicId,
    playerCount: seats,
    startingLife: 20,
    ruleset: "constructed",
    system: "mtg",
    format: "constructed",
    variant: "archenemy",
    modeSetup: {
      archenemy: { seat: 2, deck: "e01-archenemy-nicol-bolas" },
      planechase: { decks: ["pc12-chaos-reigns"] },
    },
    inviteToken: token,
    manualCodeCandidates: ["MOD234"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  const joiners = []
  for (let seat = 2; seat <= seats; seat++) {
    const joiner = await signedIn(t, `joiner-${seat}`, `Joiner ${seat}`)
    await joiner.mutation(api.games.claimSeat, {
      token,
      displayName: `Joiner ${seat}`,
      color: "#2563EB",
      variants,
      deviceId: `device-joiner-${seat}`,
    })
    joiners.push(joiner)
  }
  await host.mutation(api.games.startGame, { publicId })
  return { t, host, joiners }
}

describe("Planechase and Archenemy games", () => {
  it("keeps apps that cannot play them out", async () => {
    const t = makeConvexTest()
    const host = await signedIn(t, "host-subject", "Host")
    await host.mutation(api.games.createLobby, {
      publicId,
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      modeSetup: { planechase: {} },
      inviteToken: token,
      manualCodeCandidates: ["MOD234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
    })
    const joiner = await signedIn(t, "joiner", "Joiner")
    const join = { token, displayName: "Joiner", color: "#2563EB" }
    await expect(
      joiner.mutation(api.games.claimSeat, { ...join, variants: ["treachery"] }),
    ).rejects.toMatchObject({ data: { code: "update_required" } })
    await expect(
      joiner.mutation(api.games.claimSeat, { ...join, variants }),
    ).resolves.toMatchObject({ seat: 2 })
  })

  it("starts the chosen archenemy at 40, first, alone against one team", async () => {
    const { host } = await archenemyGame(4)
    const view = await host.query(api.games.lobbyProjection, {
      publicId,
      tableVersion: TABLE_VERSION,
    })
    const [first, archenemy, ...team] = view.players
    expect(view.players.map((player) => player.currentLife)).toEqual([20, 40, 20, 20])
    expect(view.table?.turnGroups).toEqual([
      [archenemy.playerId],
      [first.playerId, ...team.map((player) => player.playerId)],
    ])
    expect(view.table?.turn).toMatchObject({ playerId: archenemy.playerId, waiting: true })
    expect(view.table?.modes?.archenemy?.order).toHaveLength(20)
    expect(view.table?.modes?.planechase?.order).toHaveLength(10)
    const older = await host.query(api.games.lobbyProjection, { publicId, tableVersion: 3 })
    expect(older.table?.modes).toBeUndefined()
  })

  it("syncs scheme reveals and planar rolls through Convex", async () => {
    const { host, joiners } = await archenemyGame(3)
    const view = await host.query(api.games.lobbyProjection, { publicId, tableVersion: 4 })
    const archenemyId = view.players[1].playerId
    const hostId = view.players[0].playerId
    const write = (operationId: string, deviceId: string) => ({
      publicId,
      operationId,
      deviceId,
      clientCreatedAt: 1_700_000_000_000,
    })
    await joiners[0].mutation(api.games.tableAction, {
      ...write("operation-reveal-000001", "device-joiner-2"),
      action: { kind: "scheme.revealed", playerId: archenemyId },
    })
    await expect(
      host.mutation(api.games.tableAction, {
        ...write("operation-roll-0000001", "device-host-0001"),
        action: { kind: "planar.rolled", playerId: hostId, face: "chaos" },
      }),
    ).rejects.toThrow("no longer applies")
    await joiners[0].mutation(api.games.tableAction, {
      ...write("operation-roll-0000002", "device-joiner-2"),
      action: { kind: "planar.rolled", playerId: archenemyId, face: "chaos" },
    })
    const after = await host.query(api.games.lobbyProjection, { publicId, tableVersion: 4 })
    expect(after.table?.modes?.log?.map((entry) => entry.kind)).toEqual(["revealed", "rolled"])
    expect(after.table?.turn?.waiting).toBeUndefined()
  })
})
