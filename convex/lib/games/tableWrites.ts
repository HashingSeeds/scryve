import { v } from "convex/values"

import type { MutationCtx } from "../../_generated/server"
import { requireMembership, requireUser } from "../auth"
import {
  engineGameOf,
  rejectForGame,
  rejectRequest,
  type ClaimDecision,
  type GameWrite,
} from "../gameEngine"
import { throwIfRejected, writeCloudGame } from "../gameEngineConvex"
import { tableActionValidator } from "../table"
import { mutationHandler } from "./handlers"
import { gameByPublicId } from "./shared"

async function gameForWrite(ctx: MutationCtx, publicId: string, write: GameWrite) {
  throwIfRejected(rejectRequest(write))
  const game = await gameByPublicId(ctx, publicId)
  throwIfRejected(rejectForGame(engineGameOf(game), write))
  return game
}

export const changeLife = mutationHandler({
  args: {
    publicId: v.string(),
    playerId: v.id("gamePlayers"),
    operationId: v.string(),
    delta: v.number(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    tappedAt: v.optional(v.number()),
    undoOf: v.optional(v.string()),
  },
  handler: async (ctx, { publicId, ...sent }) => {
    const write: GameWrite = { kind: "life", ...sent }
    const game = await gameForWrite(ctx, publicId, write)
    const { user, player } = await requireMembership(ctx, game._id)
    const { ack, eventOf } = await writeCloudGame(ctx, game, user, write, [player])
    const event = await eventOf(ack.operationId)
    return {
      operationId: ack.operationId,
      eventId: event._id,
      sequence: event.sequence ?? null,
      currentLife: ack.currentLife,
      deduplicated: ack.deduplicated,
    }
  },
})

export const tableAction = mutationHandler({
  args: {
    publicId: v.string(),
    operationId: v.string(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    tappedAt: v.optional(v.number()),
    action: tableActionValidator,
    undoOf: v.optional(v.string()),
  },
  handler: async (ctx, { publicId, ...sent }) => {
    const write: GameWrite = { kind: "table", ...sent }
    const game = await gameForWrite(ctx, publicId, write)
    const user = await requireUser(ctx)
    const { ack, eventOf } = await writeCloudGame(ctx, game, user, write)
    return {
      operationId: ack.operationId,
      eventId: (await eventOf(ack.operationId))._id,
      deduplicated: ack.deduplicated,
    }
  },
})

export const submitCommanderDamage = mutationHandler({
  args: {
    publicId: v.string(),
    fromPlayerId: v.id("gamePlayers"),
    toPlayerId: v.id("gamePlayers"),
    commander: v.optional(v.number()),
    operationId: v.string(),
    delta: v.number(),
    commanderLimit: v.optional(v.number()),
    undoOf: v.optional(v.string()),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    tappedAt: v.optional(v.number()),
  },
  handler: async (ctx, { publicId, ...sent }) => {
    const write: GameWrite = { kind: "commander.claim", ...sent }
    const game = await gameForWrite(ctx, publicId, write)
    const user = await requireUser(ctx)
    const { ack, claimIdOf } = await writeCloudGame(ctx, game, user, write)
    return {
      operationId: ack.operationId,
      claimId: await claimIdOf(ack.operationId),
      status: ack.status,
      deduplicated: ack.deduplicated,
    }
  },
})

async function resolveCommanderClaim(
  ctx: MutationCtx,
  {
    publicId,
    ...sent
  }: {
    publicId: string
    operationId: string
    deviceId: string
    clientCreatedAt: number
    resolutionOperationId?: string
    tappedAt?: number
  },
  decision: ClaimDecision,
) {
  const write: GameWrite = { kind: "commander.resolve", decision, ...sent }
  const game = await gameForWrite(ctx, publicId, write)
  const user = await requireUser(ctx)
  const { ack, claimIdOf } = await writeCloudGame(ctx, game, user, write)
  const { total, currentLife } = ack
  return {
    operationId: ack.operationId,
    claimId: await claimIdOf(sent.operationId),
    status: ack.status,
    deduplicated: ack.deduplicated,
    ...(total === undefined ? {} : { total, currentLife }),
  }
}

export const confirmCommanderDamage = mutationHandler({
  args: {
    publicId: v.string(),
    operationId: v.string(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    resolutionOperationId: v.optional(v.string()),
    tappedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => resolveCommanderClaim(ctx, args, "confirmed"),
})

export const declineCommanderDamage = mutationHandler({
  args: {
    publicId: v.string(),
    operationId: v.string(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    resolutionOperationId: v.optional(v.string()),
    tappedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => resolveCommanderClaim(ctx, args, "declined"),
})
