import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "@/features/game/domain"
import type { OutboxDrainSummary } from "@/features/sync/outbox"

import type { ConnectedActionEvent, PendingLifeAction } from "./model"
import { ConnectedGameRepository } from "./persistence"
import { classifyWriteFailure } from "./reconciliation"
import { sendQueuedAction } from "./useConnectedGame"
import { api } from "../../../convex/_generated/api"
import { type ConvexTestHarness, makeConvexTest, signedIn } from "../../../test/convexTest"
import { MemoryStorage } from "../../../test/support/memoryStorage"

type Seat = Awaited<ReturnType<typeof seatFor>>

const publicId = "public-game-id-123456"
const gameId = asGameId(publicId)
let clock = 1_700_000_000_000

async function seatFor(t: ConvexTestHarness, owner: string, deviceId: string) {
  return { actor: await signedIn(t, owner), owner, deviceId }
}

async function activeGame(t: ConvexTestHarness) {
  const host = await seatFor(t, "host-subject", "device-host-0001")
  await host.actor.mutation(api.games.createLobby, {
    publicId,
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: "t".repeat(43),
    manualCodeCandidates: ["ABC234", "DEF567"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: host.deviceId,
  })
  const joiner = await seatFor(t, "joiner-subject", "device-joiner-0001")
  await joiner.actor.mutation(api.games.claimSeat, {
    manualCode: "ABC234",
    displayName: "Joiner",
    color: "#2563EB",
    deviceId: joiner.deviceId,
  })
  await host.actor.mutation(api.games.startGame, { publicId })
  const projection = () => host.actor.query(api.games.lobbyProjection, { publicId })
  const [hostPlayer, joinerPlayer] = (await projection()).players
  return {
    host,
    joiner,
    hostPlayerId: hostPlayer.playerId,
    joinerPlayerId: joinerPlayer.playerId,
    projection,
  }
}

type EventFields<Event> = Event extends ConnectedActionEvent
  ? Omit<Event, "gameId" | "actorId" | "deviceId" | "clientCreatedAt" | "operationId">
  : never

function queued(
  seat: Seat,
  operationId: string,
  fields: EventFields<ConnectedActionEvent>,
): PendingLifeAction {
  clock += 1
  return {
    schemaVersion: 1,
    event: {
      ...fields,
      operationId: asOperationId(operationId),
      gameId,
      actorId: asActorId(seat.owner),
      deviceId: asDeviceId(seat.deviceId),
      clientCreatedAt: clock,
    },
    queuedAt: clock,
    attempts: 0,
  }
}

async function drain(seat: Seat, actions: PendingLifeAction[]) {
  const { actor } = seat
  const mutations: Parameters<typeof sendQueuedAction>[0] = {
    changeLife: (args) => actor.mutation(api.games.changeLife, args),
    tableAction: (args) => actor.mutation(api.games.tableAction, args),
    submitCommanderDamage: (args) => actor.mutation(api.games.submitCommanderDamage, args),
    confirmCommanderDamage: (args) => actor.mutation(api.games.confirmCommanderDamage, args),
    declineCommanderDamage: (args) => actor.mutation(api.games.declineCommanderDamage, args),
  }
  const replies: Array<{ queued: string; replied: string; status?: string }> = []
  const drained = Promise.withResolvers<OutboxDrainSummary>()
  const outbox = new ConnectedGameRepository(new MemoryStorage(), seat.owner).outbox(publicId, {
    send: async (action) => {
      const reply = await sendQueuedAction(mutations, publicId, action)
      replies.push({
        queued: action.event.operationId,
        replied: reply.operationId,
        status: reply.status,
      })
      return reply
    },
    rejectReason: (cause) =>
      classifyWriteFailure(cause) === "permanent" ? String(cause) : undefined,
    onDrained: drained.resolve,
  })
  for (const action of actions) expect(outbox.enqueue(action)).toBe(true)
  const stop = outbox.start()
  const result = await drained.promise
  stop()
  for (const { queued: operationId, replied } of replies) expect(replied).toBe(operationId)
  expect(result).toEqual({ acknowledged: actions.length, failed: 0, outcome: "success" })
  expect(outbox.getState()).toMatchObject({ pending: [], failures: [] })
  return replies.map(({ queued: operationId, status }) => [operationId, status])
}

describe("sendQueuedAction against the real game mutations", () => {
  it("drains every connected write kind with replies that carry the queued operation ID", async () => {
    const t = makeConvexTest()
    const { host, joiner, hostPlayerId, joinerPlayerId, projection } = await activeGame(t)
    const claim = (from: string, to: string, delta: number) => ({
      type: "commanderDamage.submitted" as const,
      fromPlayerId: asPlayerId(from),
      toPlayerId: asPlayerId(to),
      delta,
    })
    const resolve = (claimOperationId: string, to: string, accepted: boolean) => ({
      type: "commanderDamage.resolved" as const,
      claimOperationId: asOperationId(claimOperationId),
      toPlayerId: asPlayerId(to),
      accepted,
    })

    expect(
      await drain(host, [
        queued(host, "operation-life-0001", {
          type: "life.changed",
          playerId: asPlayerId(hostPlayerId),
          delta: 1,
        }),
        queued(host, "operation-table-0001", {
          type: "table.action",
          action: { kind: "designation.taken", playerId: hostPlayerId, designationId: "monarch" },
        }),
        queued(host, "operation-claim-0001", claim(hostPlayerId, joinerPlayerId, 7)),
        // why: the pair already has a pending claim, so the server declines this one on arrival.
        queued(host, "operation-claim-0002", claim(hostPlayerId, joinerPlayerId, 1)),
      ]),
    ).toEqual([
      ["operation-life-0001", undefined],
      ["operation-table-0001", undefined],
      ["operation-claim-0001", "pending"],
      ["operation-claim-0002", "declined"],
    ])
    expect(
      await drain(joiner, [
        queued(
          joiner,
          "operation-confirm-0001",
          resolve("operation-claim-0001", joinerPlayerId, true),
        ),
        queued(joiner, "operation-claim-0003", claim(joinerPlayerId, hostPlayerId, 3)),
      ]),
    ).toEqual([
      ["operation-confirm-0001", "confirmed"],
      ["operation-claim-0003", "pending"],
    ])
    expect(
      await drain(host, [
        queued(
          host,
          "operation-decline-0001",
          resolve("operation-claim-0003", hostPlayerId, false),
        ),
      ]),
    ).toEqual([["operation-decline-0001", "declined"]])

    const final = await projection()
    expect(final.players.map((player) => player.currentLife)).toEqual([41, 33])
    expect(final.commanderDamage?.pendingClaims ?? []).toEqual([])
  })
})
