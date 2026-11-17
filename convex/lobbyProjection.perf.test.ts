import { makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"
import { TABLE_VERSION } from "./lib/table"
import { expectWithinBudget } from "../test/perf/budget"

// why: Convex sends values as JSON, and these hold no int64 or bytes that its encoding would wrap.
const websocketBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))

const appShapedOperationId = (index: number) => `operation_${String(index).padStart(32, "0")}`

async function fourPlayerGame() {
  const t = makeConvexTest()
  const host = await signedIn(t, "host-subject", "Host")
  const { publicId } = await host.mutation(api.games.createLobby, {
    publicId: "public-game-id-123456",
    playerCount: 4,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: "t".repeat(43),
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  const guests = []
  for (const name of ["Ada", "Grace", "Katherine"]) {
    const guest = await signedIn(t, `${name}-subject`, name)
    await guest.mutation(api.games.claimSeat, {
      token: "t".repeat(43),
      displayName: name,
      color: "#2563EB",
    })
    guests.push(guest)
  }
  await host.mutation(api.games.startGame, { publicId })
  const { players } = await host.query(api.games.lobbyProjection, { publicId })
  return { host, guest: guests[0], publicId, hostPlayerId: players[0].playerId }
}

describe("lobbyProjection websocket budget", () => {
  it("each life change re-sends about 1.4 KB to each phone, however long the game runs", async () => {
    const { host, guest, publicId, hostPlayerId } = await fourPlayerGame()
    // why: the app subscribes with exactly these args, so the server sends this result on every write.
    const projectionBytes = async (actor: typeof host, deviceId: string) =>
      websocketBytes(
        await actor.query(api.games.lobbyProjection, {
          publicId,
          deviceId,
          includeRecentOperationIds: false,
          tableVersion: TABLE_VERSION,
        }),
      )
    const lifeChange = (index: number) => ({
      publicId,
      playerId: hostPlayerId,
      operationId: appShapedOperationId(index),
      delta: -1,
      deviceId: "device-host-0001",
      clientCreatedAt: 1_700_000_000_000 + index,
      tappedAt: 1_700_000_000_000 + index,
    })

    const fresh = {
      "host projection": await projectionBytes(host, "device-host-0001"),
      "guest projection": await projectionBytes(guest, "device-guest-001"),
    }
    for (let index = 0; index < 30; index++)
      await host.mutation(api.games.changeLife, lifeChange(index))

    expectWithinBudget(
      {
        ...fresh,
        "host projection after 30 changes": await projectionBytes(host, "device-host-0001"),
        "guest projection after 30 changes": await projectionBytes(guest, "device-guest-001"),
        "changeLife args": websocketBytes(lifeChange(30)),
      },
      {
        "host projection": 1456,
        "guest projection": 1358,
        "host projection after 30 changes": 1457,
        "guest projection after 30 changes": 1417,
        "changeLife args": 239,
      },
    )
  })
})
