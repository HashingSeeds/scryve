import {
  engineGameOf,
  runAsync,
  writeGame,
  type CommanderClaimRecord,
  type CommanderPair,
  type EngineError,
  type GameChange,
  type GameEventRecord,
  type GameStore,
  type GameWrite,
} from "./gameEngine"
import { limitGameRate } from "./gameRateLimits"
import { commanderField, MAX_PENDING_COMMANDER_CLAIMS } from "./gameRules"
import { gameWriteError } from "./gameWriteErrors"
import type { TableState } from "./table"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

const rejection = ({ code, message }: EngineError) =>
  code ? gameWriteError(code, message) : new Error(message)

export function throwIfRejected(error: EngineError | null) {
  if (error) throw rejection(error)
}

export function storedDesignations(ctx: QueryCtx, designations: TableState["designations"]) {
  const stored: Record<string, Id<"gamePlayers">> = {}
  for (const [designationId, holder] of Object.entries(designations)) {
    const holderId = ctx.db.normalizeId("gamePlayers", holder)
    if (holderId) stored[designationId] = holderId
  }
  return stored
}

function cached<Key, Value>(
  load: (key: Key) => Promise<Value>,
  keyOf: (key: Key) => string = String,
) {
  const loads = new Map<string, Promise<Value>>()
  return (key: Key) => {
    const id = keyOf(key)
    const loading = loads.get(id) ?? load(key)
    loads.set(id, loading)
    return loading
  }
}

export async function writeCloudGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  user: Doc<"users">,
  write: GameWrite,
  seatsRead: readonly Doc<"gamePlayers">[] = [],
) {
  const seatId = (id: string) => {
    const normalized = ctx.db.normalizeId("gamePlayers", id)
    if (!normalized) throw new Error("Seat not found")
    return normalized
  }
  const userId = (id: string) => {
    const normalized = ctx.db.normalizeId("users", id)
    if (!normalized) throw new Error("User not found")
    return normalized
  }

  const eventDoc = cached((operationId: string) =>
    ctx.db
      .query("gameEvents")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", operationId),
      )
      .unique(),
  )
  const claimDoc = cached((operationId: string) =>
    ctx.db
      .query("gameCommanderClaims")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", operationId),
      )
      .unique(),
  )
  const pairDoc = cached(
    (pair: CommanderPair) =>
      ctx.db
        .query("gameCommanderDamage")
        .withIndex("by_game_pair_and_commander", (q) =>
          q
            .eq("gameId", game._id)
            .eq("fromPlayerId", seatId(pair.fromPlayerId))
            .eq("toPlayerId", seatId(pair.toPlayerId))
            .eq("commander", pair.commander),
        )
        .unique(),
    ({ fromPlayerId, toPlayerId, commander }) => `${fromPlayerId}:${toPlayerId}:${commander}`,
  )
  const insertedEvents = new Map<string, Id<"gameEvents">>()
  const insertedClaims = new Map<string, Id<"gameCommanderClaims">>()

  const eventRow = ({
    playerId,
    fromPlayerId,
    toPlayerId,
    actorUserId,
    ...event
  }: GameEventRecord) => ({
    ...event,
    gameId: game._id,
    playerId: seatId(playerId),
    ...(fromPlayerId === undefined ? {} : { fromPlayerId: seatId(fromPlayerId) }),
    ...(toPlayerId === undefined ? {} : { toPlayerId: seatId(toPlayerId) }),
    ...(actorUserId === undefined ? {} : { actorUserId: userId(actorUserId) }),
  })

  const claimRow = ({
    fromPlayerId,
    toPlayerId,
    actorUserId,
    resolvedByUserId,
    ...claim
  }: CommanderClaimRecord) => ({
    ...claim,
    gameId: game._id,
    fromPlayerId: seatId(fromPlayerId),
    toPlayerId: seatId(toPlayerId),
    ...(actorUserId === undefined ? {} : { actorUserId: userId(actorUserId) }),
    ...(resolvedByUserId === undefined ? {} : { resolvedByUserId: userId(resolvedByUserId) }),
  })

  async function applyChange(change: GameChange) {
    if (change.kind === "seat.patch") {
      await ctx.db.patch(seatId(change.seatId), change.patch)
    } else if (change.kind === "event.insert") {
      const id = await ctx.db.insert("gameEvents", eventRow(change.event))
      insertedEvents.set(change.event.operationId, id)
    } else if (change.kind === "event.rekey") {
      const event = await eventDoc(change.operationId)
      if (event) await ctx.db.patch(event._id, { operationId: change.to })
    } else if (change.kind === "claim.insert") {
      const id = await ctx.db.insert("gameCommanderClaims", claimRow(change.claim))
      insertedClaims.set(change.claim.operationId, id)
    } else if (change.kind === "claim.patch") {
      const claim = await claimDoc(change.operationId)
      const { resolvedByUserId, ...patch } = change.patch
      if (claim)
        await ctx.db.patch(claim._id, {
          ...patch,
          ...(resolvedByUserId === undefined ? {} : { resolvedByUserId: userId(resolvedByUserId) }),
        })
    } else if (change.kind === "pair.put") {
      const pair = await pairDoc(change)
      if (pair) await ctx.db.patch(pair._id, { total: change.total, updatedAt: change.updatedAt })
      else
        await ctx.db.insert("gameCommanderDamage", {
          gameId: game._id,
          fromPlayerId: seatId(change.fromPlayerId),
          toPlayerId: seatId(change.toPlayerId),
          ...commanderField(change.commander),
          total: change.total,
          updatedAt: change.updatedAt,
        })
    } else
      await ctx.db.patch(game._id, { designations: storedDesignations(ctx, change.designations) })
  }

  const store: GameStore = {
    game: engineGameOf(game),
    async seat(id) {
      const normalized = ctx.db.normalizeId("gamePlayers", id)
      const seat =
        seatsRead.find((row) => row._id === id) ??
        (normalized ? await ctx.db.get(normalized) : null)
      return seat?.gameId === game._id ? { ...seat, id: seat._id } : undefined
    },
    event: async (operationId) => (await eventDoc(operationId)) ?? undefined,
    claim: async (operationId) => (await claimDoc(operationId)) ?? undefined,
    pendingClaims: () =>
      ctx.db
        .query("gameCommanderClaims")
        .withIndex("by_game_and_status", (q) => q.eq("gameId", game._id).eq("status", "pending"))
        .take(MAX_PENDING_COMMANDER_CLAIMS + 1),
    pairTotal: async (pair) => (await pairDoc(pair))?.total ?? 0,
    beforeNewWrite: () => limitGameRate(ctx, "gameWrite", user._id),
    async apply(changes) {
      for (const change of changes) await applyChange(change)
    },
  }

  const identity = { userId: user._id, isHost: game.hostUserId === user._id }
  const result = await runAsync(writeGame(store, identity, write, Date.now()))
  if (!result.ok) throw rejection(result.error)
  return {
    ack: result.ack,
    async eventOf(operationId: string): Promise<Pick<Doc<"gameEvents">, "_id" | "sequence">> {
      const insertedId = insertedEvents.get(operationId)
      const event = insertedId ? { _id: insertedId } : await eventDoc(operationId)
      if (!event) throw new Error("No event was recorded for this operation")
      return event
    },
    async claimIdOf(operationId: string) {
      const claimId = insertedClaims.get(operationId) ?? (await claimDoc(operationId))?._id
      if (!claimId) throw new Error("No claim was recorded for this operation")
      return claimId
    },
  }
}
