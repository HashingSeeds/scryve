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
    const { t, host } = await archenemyGame(4)
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
    const authority = (await t.run((ctx) => ctx.db.query("games").first()))!.modes!
    expect(authority.archenemy?.order).toHaveLength(20)
    expect(authority.planechase?.order).toHaveLength(10)
    for (const tableVersion of [3, 4]) {
      const older = await host.query(api.games.lobbyProjection, { publicId, tableVersion })
      expect(older.table?.modes).toBeUndefined()
      expect(older.table?.turn).toBeDefined()
    }
  })

  it("syncs scheme reveals and planar rolls through Convex", async () => {
    const { host, joiners } = await archenemyGame(3)
    const view = await host.query(api.games.lobbyProjection, {
      publicId,
      tableVersion: TABLE_VERSION,
    })
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
    const after = await host.query(api.games.lobbyProjection, {
      publicId,
      tableVersion: TABLE_VERSION,
    })
    expect(after.table?.modes?.log?.map((entry) => entry.kind)).toEqual(["revealed", "rolled"])
    expect(after.table?.turn?.waiting).toBeUndefined()
  })

  it("never sends a client a face-down plane or scheme", async () => {
    const { t, host, joiners } = await archenemyGame(4)
    const view = await host.query(api.games.lobbyProjection, {
      publicId,
      tableVersion: TABLE_VERSION,
    })
    const archenemyId = view.players[1].playerId
    for (const [index, kind] of (
      ["scheme.revealed", "scheme.revealed", "planar.walked"] as const
    ).entries())
      await joiners[0].mutation(api.games.tableAction, {
        publicId,
        operationId: `operation-hidden-${index}0000000`,
        deviceId: "device-joiner-2",
        clientCreatedAt: 1_700_000_000_000,
        action: { kind, playerId: archenemyId },
      })
    const authority = (await t.run((ctx) => ctx.db.query("games").first()))!.modes!
    const revealedEver = (kind: "walked" | "revealed") =>
      new Set((authority.log ?? []).flatMap((entry) => (entry.kind === kind ? [entry.card] : [])))
    const walked = revealedEver("walked")
    const revealed = revealedEver("revealed")
    const facedown = {
      planar: new Set(authority.planechase!.order!.slice(1).filter((card) => !walked.has(card))),
      scheme: new Set(authority.archenemy!.order!.filter((card) => !revealed.has(card))),
    }
    expect(facedown.scheme.size).toBeGreaterThan(0)
    for (const client of [host, ...joiners]) {
      const { table } = await client.query(api.games.lobbyProjection, {
        publicId,
        tableVersion: TABLE_VERSION,
      })
      const modes = table!.modes!
      expect(JSON.stringify(modes)).not.toContain("order")
      const log = modes.log ?? []
      const planar = [
        modes.planechase!.faceUp,
        ...log.filter((entry) => entry.kind === "walked").map((entry) => entry.card),
      ]
      const scheme = [
        modes.archenemy!.shown,
        ...(modes.archenemy!.ongoing ?? []),
        ...log.filter((entry) => entry.kind === "revealed").map((entry) => entry.card),
      ]
      expect(planar.filter((card) => card !== undefined && facedown.planar.has(card))).toEqual([])
      expect(scheme.filter((card) => card !== undefined && facedown.scheme.has(card))).toEqual([])
      expect(modes.planechase!.faceUp).toBe(authority.planechase!.order![0])
    }
  })
})
