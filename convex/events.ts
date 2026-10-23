import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { requireUser } from "./lib/auth"
import {
  assertCanAddPlayer,
  assertPlannedRounds,
  assertResult,
  assertRoundMinutes,
  assertSettings,
  changeClock,
  confirmResult,
  eventError,
  reportResult,
  startRound,
  type EventActor,
  type EventTable,
} from "./lib/events/commands"
import { MAX_EVENT_PLAYERS, MAX_EVENT_ROUNDS, type EventSettings } from "./lib/events/model"
import { eventRules } from "./lib/events/rules"
import { computeStandings } from "./lib/events/standings"
import { eventPoints, eventTableResult } from "./lib/events/validators"
import { limitGameRate } from "./lib/gameRateLimits"
import { assertGameSystem } from "./lib/integrations"
import { publicUsernameFor } from "./lib/moderation"
import { nameFailsGate } from "./lib/nameFilter"
import {
  assertDisplayName,
  assertEventName,
  assertManualCodeCandidates,
  normalizeManualCode,
} from "./lib/policy"
import { formatDefinition } from "./lib/systems"

const MAX_OPEN_EVENTS = 5
const MAX_LISTED_EVENTS = 30
const MAX_EVENT_TABLES = MAX_EVENT_PLAYERS * MAX_EVENT_ROUNDS

type Ctx = QueryCtx | MutationCtx

const bestOfValidator = v.union(v.literal(1), v.literal(3), v.literal(5))

const settingsOf = (event: Doc<"events">): EventSettings => ({
  structure: event.structure,
  bestOf: event.bestOf,
  points: event.points,
})

const tableOf = (table: Doc<"eventTables">): EventTable => ({
  round: table.round,
  table: table.table,
  playerIds: table.playerIds,
  result: table.result,
  status: table.status,
  reportedBy: table.reportedBy,
})

function codeOrUndefined(code: string) {
  try {
    return normalizeManualCode(code)
  } catch {
    return undefined
  }
}

function assertName(raw: string, assert: (name: string) => string) {
  const name = assert(raw)
  if (nameFailsGate(name)) throw eventError("name_rejected", "Choose a different name")
  return name
}

async function loadEvent(ctx: Ctx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId)
  if (!event) throw new Error("Event not found")
  return event
}

async function requireOrganizer(ctx: Ctx, event: Doc<"events">) {
  const user = await requireUser(ctx)
  if (event.ownerUserId !== user._id) throw new Error("Only the organizer can do that")
  return user
}

async function playerFor(ctx: Ctx, eventId: Id<"events">, userId: Id<"users">) {
  return await ctx.db
    .query("eventPlayers")
    .withIndex("by_event_and_user", (q) => q.eq("eventId", eventId).eq("userId", userId))
    .first()
}

async function requireActor(ctx: Ctx, event: Doc<"events">): Promise<EventActor> {
  const user = await requireUser(ctx)
  if (event.ownerUserId === user._id) return { kind: "organizer" }
  const player = await playerFor(ctx, event._id, user._id)
  if (!player) throw new Error("Join this event first")
  return { kind: "player", playerId: player._id }
}

async function loadPlayers(ctx: Ctx, eventId: Id<"events">) {
  return await ctx.db
    .query("eventPlayers")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .take(MAX_EVENT_PLAYERS)
}

async function loadTables(ctx: Ctx, eventId: Id<"events">, throughRound = MAX_EVENT_ROUNDS) {
  return await ctx.db
    .query("eventTables")
    .withIndex("by_event_and_round", (q) => q.eq("eventId", eventId).lte("round", throughRound))
    .take(MAX_EVENT_TABLES)
}

async function roundTables(ctx: Ctx, eventId: Id<"events">, round: number) {
  return await ctx.db
    .query("eventTables")
    .withIndex("by_event_and_round", (q) => q.eq("eventId", eventId).eq("round", round))
    .take(MAX_EVENT_PLAYERS)
}

async function addPlayer(
  ctx: MutationCtx,
  event: Doc<"events">,
  player: { name: string; userId?: Id<"users"> },
) {
  assertCanAddPlayer(event.status, event.playerCount)
  const now = Date.now()
  const playerId = await ctx.db.insert("eventPlayers", {
    eventId: event._id,
    ...player,
    joinedAt: now,
  })
  await ctx.db.patch(event._id, { playerCount: event.playerCount + 1, updatedAt: now })
  return playerId
}

const accountName = (user: Doc<"users">) => publicUsernameFor(user) ?? user.displayName

async function claimCode(ctx: MutationCtx, candidates: string[]) {
  assertManualCodeCandidates(candidates)
  for (const candidate of candidates) {
    const code = normalizeManualCode(candidate)
    const taken = await ctx.db
      .query("events")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (!taken) return code
  }
  throw new Error("Event code collision; retry with fresh candidates")
}

export const create = mutation({
  args: {
    name: v.string(),
    system: v.string(),
    format: v.string(),
    structure: v.union(v.literal("swiss"), v.literal("pods")),
    bestOf: bestOfValidator,
    points: v.optional(eventPoints),
    plannedRounds: v.number(),
    roundMinutes: v.number(),
    codeCandidates: v.array(v.string()),
    joinAsPlayer: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await limitGameRate(ctx, "eventCreate", user._id)
    const name = assertName(args.name, assertEventName)
    if (!name) throw new Error("Name the event")
    const system = assertGameSystem(args.system)
    if (!formatDefinition(system, args.format)) throw new Error("Choose a format for this game")
    const settings = assertSettings({
      structure: args.structure,
      bestOf: args.bestOf,
      points: args.points ?? eventRules(system).defaultPoints,
    })
    let open = 0
    for (const status of ["registration", "active"] as const)
      open += (
        await ctx.db
          .query("events")
          .withIndex("by_owner_user_and_status", (q) =>
            q.eq("ownerUserId", user._id).eq("status", status),
          )
          .take(MAX_OPEN_EVENTS)
      ).length
    if (open >= MAX_OPEN_EVENTS)
      throw eventError(
        "event_limit",
        `Finish an event first; you can run ${MAX_OPEN_EVENTS} at once`,
      )
    const code = await claimCode(ctx, args.codeCandidates)
    const now = Date.now()
    const eventId = await ctx.db.insert("events", {
      ownerUserId: user._id,
      code,
      name,
      system,
      format: args.format,
      ...settings,
      plannedRounds: assertPlannedRounds(args.plannedRounds),
      roundMinutes: assertRoundMinutes(args.roundMinutes),
      status: "registration",
      round: 0,
      playerCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    if (args.joinAsPlayer)
      await addPlayer(ctx, (await ctx.db.get(eventId))!, {
        name: accountName(user),
        userId: user._id,
      })
    return { eventId, code }
  },
})

export const update = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    plannedRounds: v.optional(v.number()),
    roundMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId)
    await requireOrganizer(ctx, event)
    if (event.status === "finished") throw eventError("event_finished", "This event has finished")
    const name = args.name === undefined ? undefined : assertName(args.name, assertEventName)
    if (name === "") throw new Error("Name the event")
    await ctx.db.patch(event._id, {
      ...(name === undefined ? {} : { name }),
      ...(args.plannedRounds === undefined
        ? {}
        : { plannedRounds: assertPlannedRounds(args.plannedRounds) }),
      ...(args.roundMinutes === undefined
        ? {}
        : { roundMinutes: assertRoundMinutes(args.roundMinutes) }),
      updatedAt: Date.now(),
    })
    return null
  },
})

export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await limitGameRate(ctx, "eventJoin", user._id)
    const code = codeOrUndefined(args.code)
    const event = code
      ? await ctx.db
          .query("events")
          .withIndex("by_code", (q) => q.eq("code", code))
          .first()
      : null
    // why: returning keeps the spent rate-limit token; a throw would roll it back and let codes be guessed freely.
    if (!event) return null
    const existing = await playerFor(ctx, event._id, user._id)
    if (existing) return { eventId: event._id, playerId: existing._id }
    const playerId = await addPlayer(ctx, event, { name: accountName(user), userId: user._id })
    return { eventId: event._id, playerId }
  },
})

export const addGuest = mutation({
  args: { eventId: v.id("events"), name: v.string() },
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId)
    await requireOrganizer(ctx, event)
    return await addPlayer(ctx, event, { name: assertName(args.name, assertDisplayName) })
  },
})

export const dropPlayer = mutation({
  args: { playerId: v.id("eventPlayers") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId)
    if (!player) throw new Error("Player not found")
    const event = await loadEvent(ctx, player.eventId)
    const user = await requireUser(ctx)
    if (event.ownerUserId !== user._id && player.userId !== user._id)
      throw new Error("Only the organizer can drop another player")
    if (event.status === "finished") throw eventError("event_finished", "This event has finished")
    const now = Date.now()
    if (event.round === 0) {
      await ctx.db.delete(player._id)
      await ctx.db.patch(event._id, { playerCount: event.playerCount - 1, updatedAt: now })
    } else if (player.droppedAt === undefined) {
      await ctx.db.patch(player._id, { droppedAt: now })
      await ctx.db.patch(event._id, { updatedAt: now })
    }
    return null
  },
})

export const undropPlayer = mutation({
  args: { playerId: v.id("eventPlayers") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId)
    if (!player) throw new Error("Player not found")
    const event = await loadEvent(ctx, player.eventId)
    await requireOrganizer(ctx, event)
    if (event.status === "finished") throw eventError("event_finished", "This event has finished")
    await ctx.db.patch(player._id, { droppedAt: undefined })
    return null
  },
})

export const startNextRound = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId)
    await requireOrganizer(ctx, event)
    const [players, tables] = await Promise.all([
      loadPlayers(ctx, event._id),
      loadTables(ctx, event._id),
    ])
    const next = startRound({
      status: event.status,
      round: event.round,
      players: players.map((player) => ({
        id: player._id,
        dropped: player.droppedAt !== undefined,
      })),
      tables: tables.map(tableOf),
      settings: settingsOf(event),
      random: Math.random,
    })
    const now = Date.now()
    const playerIds = new Map(players.map((player) => [player._id as string, player._id]))
    for (const table of next.tables)
      await ctx.db.insert("eventTables", {
        eventId: event._id,
        round: table.round,
        table: table.table,
        playerIds: table.playerIds.map((id) => playerIds.get(id)!),
        status: table.status,
        result: table.result,
        updatedAt: now,
      })
    await ctx.db.patch(event._id, {
      status: "active",
      round: next.round,
      clock: { startedAt: now, durationMs: event.roundMinutes * 60_000 },
      updatedAt: now,
    })
    return next.round
  },
})

async function loadTable(ctx: Ctx, tableId: Id<"eventTables">) {
  const table = await ctx.db.get(tableId)
  if (!table) throw new Error("Table not found")
  return { table, event: await loadEvent(ctx, table.eventId) }
}

async function patchTable(
  ctx: MutationCtx,
  table: Doc<"eventTables">,
  patch: Pick<EventTable, "result" | "status" | "reportedBy">,
) {
  await ctx.db.patch(table._id, {
    result: patch.result,
    status: patch.status,
    reportedBy:
      patch.reportedBy === undefined
        ? undefined
        : (ctx.db.normalizeId("eventPlayers", patch.reportedBy) ?? undefined),
    updatedAt: Date.now(),
  })
}

export const report = mutation({
  args: { tableId: v.id("eventTables"), result: v.union(eventTableResult, v.null()) },
  handler: async (ctx, args) => {
    const { table, event } = await loadTable(ctx, args.tableId)
    const actor = await requireActor(ctx, event)
    const result =
      args.result &&
      assertResult(
        table,
        args.result,
        settingsOf(event),
        eventRules(assertGameSystem(event.system)),
      )
    await patchTable(
      ctx,
      table,
      reportResult(
        { status: event.status, round: event.round, table: tableOf(table) },
        actor,
        result,
      ),
    )
    return null
  },
})

export const confirm = mutation({
  args: { tableId: v.id("eventTables") },
  handler: async (ctx, args) => {
    const { table, event } = await loadTable(ctx, args.tableId)
    const actor = await requireActor(ctx, event)
    await patchTable(
      ctx,
      table,
      confirmResult({ status: event.status, round: event.round, table: tableOf(table) }, actor),
    )
    return null
  },
})

export const adjustClock = mutation({
  args: {
    eventId: v.id("events"),
    action: v.union(
      v.object({ kind: v.literal("pause") }),
      v.object({ kind: v.literal("resume") }),
      v.object({ kind: v.literal("adjust"), minutes: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId)
    await requireOrganizer(ctx, event)
    if (event.status !== "active" || !event.clock) throw new Error("No round is running")
    const now = Date.now()
    await ctx.db.patch(event._id, {
      clock: changeClock(event.clock, args.action, now),
      updatedAt: now,
    })
    return null
  },
})

export const finish = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId)
    await requireOrganizer(ctx, event)
    if (event.status === "finished") return null
    const now = Date.now()
    await ctx.db.patch(event._id, {
      status: "finished",
      clock: undefined,
      finishedAt: now,
      updatedAt: now,
    })
    return null
  },
})

export const remove = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await loadEvent(ctx, args.eventId)
    await requireOrganizer(ctx, event)
    if (event.round !== 0) throw new Error("Finish the event instead; it already has results")
    for (const player of await loadPlayers(ctx, event._id)) await ctx.db.delete(player._id)
    await ctx.db.delete(event._id)
    return null
  },
})

const nearbyTable = v.object({
  round: v.number(),
  table: v.number(),
  playerIds: v.array(v.string()),
  status: v.union(v.literal("open"), v.literal("reported"), v.literal("confirmed")),
  result: v.optional(eventTableResult),
  reportedBy: v.optional(v.string()),
})

/** why: a nearby event's authority was the host device, so its finished record arrives whole instead of replaying player writes; importing twice returns the first copy. */
export const importNearby = mutation({
  args: {
    nearbyId: v.string(),
    name: v.string(),
    format: v.string(),
    structure: v.union(v.literal("swiss"), v.literal("pods")),
    bestOf: bestOfValidator,
    points: eventPoints,
    plannedRounds: v.number(),
    roundMinutes: v.number(),
    round: v.number(),
    createdAt: v.number(),
    finishedAt: v.number(),
    players: v.array(
      v.object({ id: v.string(), name: v.string(), droppedAt: v.optional(v.number()) }),
    ),
    tables: v.array(nearbyTable),
    codeCandidates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db
      .query("events")
      .withIndex("by_owner_user_and_nearby_id", (q) =>
        q.eq("ownerUserId", user._id).eq("nearbyId", args.nearbyId),
      )
      .first()
    if (existing) return { eventId: existing._id }
    await limitGameRate(ctx, "eventCreate", user._id)
    const name = assertName(args.name, assertEventName)
    if (!name) throw new Error("Name the event")
    if (!formatDefinition("mtg", args.format)) throw new Error("Choose a format for this game")
    const settings = assertSettings({
      structure: args.structure,
      bestOf: args.bestOf,
      points: args.points,
    })
    if (args.players.length > MAX_EVENT_PLAYERS)
      throw eventError("event_full", `An event can have at most ${MAX_EVENT_PLAYERS} players`)
    if (!Number.isInteger(args.round) || args.round < 0 || args.round > MAX_EVENT_ROUNDS)
      throw new Error(`An event can have at most ${MAX_EVENT_ROUNDS} rounds`)
    if (args.tables.length > MAX_EVENT_TABLES) throw new Error("Too many tables")
    const known = new Set(args.players.map((player) => player.id))
    if (known.size !== args.players.length) throw new Error("Duplicate player")
    const seated = new Set<string>()
    for (const table of args.tables) {
      for (const key of [
        `table:${table.round}:${table.table}`,
        ...table.playerIds.map((id) => `seat:${table.round}:${id}`),
      ]) {
        if (seated.has(key)) throw new Error("A player or table appears twice in one round")
        seated.add(key)
      }
      if (!Number.isInteger(table.round) || table.round < 1 || table.round > args.round)
        throw new Error("A table belongs to a round that wasn't played")
      if (table.playerIds.some((id) => !known.has(id))) throw new Error("Unknown player")
      if (table.result?.kind === "bye") {
        if (table.playerIds.length !== 1) throw new Error("Only a lone player gets a bye")
      } else if (table.result) assertResult(table, table.result, settings, eventRules("mtg"))
    }
    const code = await claimCode(ctx, args.codeCandidates)
    const now = Date.now()
    const eventId = await ctx.db.insert("events", {
      ownerUserId: user._id,
      code,
      name,
      system: "mtg",
      format: args.format,
      ...settings,
      plannedRounds: assertPlannedRounds(args.plannedRounds),
      roundMinutes: assertRoundMinutes(args.roundMinutes),
      status: "finished",
      round: args.round,
      playerCount: args.players.length,
      createdAt: args.createdAt,
      updatedAt: now,
      finishedAt: args.finishedAt,
      nearbyId: args.nearbyId,
    })
    const playerIds = new Map<string, Id<"eventPlayers">>()
    for (const player of args.players)
      playerIds.set(
        player.id,
        await ctx.db.insert("eventPlayers", {
          eventId,
          name: assertName(player.name, assertDisplayName),
          joinedAt: args.createdAt,
          ...(player.droppedAt === undefined ? {} : { droppedAt: player.droppedAt }),
        }),
      )
    for (const table of args.tables)
      await ctx.db.insert("eventTables", {
        eventId,
        round: table.round,
        table: table.table,
        playerIds: table.playerIds.map((id) => playerIds.get(id)!),
        status: table.status,
        result: table.result,
        reportedBy: table.reportedBy === undefined ? undefined : playerIds.get(table.reportedBy),
        updatedAt: now,
      })
    return { eventId }
  },
})

export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = codeOrUndefined(args.code)
    if (!code) return null
    const event = await ctx.db
      .query("events")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    return event?._id ?? null
  },
})

/** why: public, so a signed-out store screen can show the event from its code alone. */
export const view = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) return null
    const identity = await ctx.auth.getUserIdentity()
    const viewer = identity
      ? await ctx.db
          .query("users")
          .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
          .unique()
      : null
    const [players, tables] = await Promise.all([
      loadPlayers(ctx, event._id),
      roundTables(ctx, event._id, event.round),
    ])
    const users = await Promise.all(
      players.map((player) => (player.userId ? ctx.db.get(player.userId) : null)),
    )
    return {
      id: event._id,
      code: event.code,
      name: event.name,
      system: event.system,
      format: event.format,
      structure: event.structure,
      bestOf: event.bestOf,
      points: event.points,
      plannedRounds: event.plannedRounds,
      roundMinutes: event.roundMinutes,
      status: event.status,
      round: event.round,
      clock: event.clock ?? null,
      isOrganizer: viewer !== null && event.ownerUserId === viewer._id,
      myPlayerId: (viewer && players.find((player) => player.userId === viewer._id)?._id) ?? null,
      players: players.map((player, index) => {
        const user = users[index]
        return {
          id: player._id,
          name: user ? accountName(user) : player.name,
          guest: player.userId === undefined,
          dropped: player.droppedAt !== undefined,
        }
      }),
      tables: tables
        .map((table) => ({
          id: table._id,
          table: table.table,
          playerIds: table.playerIds,
          status: table.status,
          result: table.result ?? null,
          reportedBy: table.reportedBy ?? null,
        }))
        .sort((a, b) => a.table - b.table),
    }
  },
})

/** why: callers pass the last complete round, so every report in the current round doesn't rerun standings on every phone. */
export const standings = query({
  args: { eventId: v.id("events"), throughRound: v.number() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) return null
    if (!Number.isInteger(args.throughRound) || args.throughRound < 0) return []
    const [players, tables] = await Promise.all([
      loadPlayers(ctx, event._id),
      loadTables(ctx, event._id, Math.min(args.throughRound, event.round)),
    ])
    return computeStandings({
      players: players.map((player) => ({
        id: player._id,
        dropped: player.droppedAt !== undefined,
      })),
      tables: tables.map(tableOf),
      settings: settingsOf(event),
      rules: eventRules(assertGameSystem(event.system)),
    })
  },
})

export const roundResults = query({
  args: { eventId: v.id("events"), round: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.round) || args.round < 1 || args.round > MAX_EVENT_ROUNDS) return []
    const tables = await roundTables(ctx, args.eventId, args.round)
    return tables
      .map((table) => ({
        id: table._id,
        table: table.table,
        playerIds: table.playerIds,
        status: table.status,
        result: table.result ?? null,
      }))
      .sort((a, b) => a.table - b.table)
  },
})

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    if (!user) return []
    const owned = (
      await Promise.all(
        (["registration", "active", "finished"] as const).map((status) =>
          ctx.db
            .query("events")
            .withIndex("by_owner_user_and_status", (q) =>
              q.eq("ownerUserId", user._id).eq("status", status),
            )
            .order("desc")
            .take(MAX_LISTED_EVENTS),
        ),
      )
    ).flat()
    const joined = await ctx.db
      .query("eventPlayers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(MAX_LISTED_EVENTS)
    const events = new Map(owned.map((event) => [event._id, event]))
    for (const player of joined)
      if (!events.has(player.eventId)) {
        const event = await ctx.db.get(player.eventId)
        if (event) events.set(event._id, event)
      }
    return [...events.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LISTED_EVENTS)
      .map((event) => ({
        id: event._id,
        name: event.name,
        system: event.system,
        format: event.format,
        structure: event.structure,
        status: event.status,
        round: event.round,
        playerCount: event.playerCount,
        isOrganizer: event.ownerUserId === user._id,
        updatedAt: event.updatedAt,
      }))
  },
})
