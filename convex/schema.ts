import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    membershipMigrationVersion: v.optional(v.number()),
    membershipMigrationCursor: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_user", ["clerkUserId"]),

  games: defineTable({
    publicId: v.string(),
    hostUserId: v.optional(v.id("users")),
    mode: v.literal("connected"),
    status: v.union(
      v.literal("lobby"),
      v.literal("active"),
      v.literal("finished"),
      v.literal("abandoned"),
    ),
    playerCount: v.number(),
    startingLife: v.number(),
    ruleset: v.string(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    updatedAt: v.number(),
    currentInvitationId: v.optional(v.id("invitations")),
    // Reserved for a future event stream without enabling connected mutations in Phase 2.
    // Legacy event-count base. New life writes never patch this shared row.
    eventSequence: v.optional(v.number()),
  })
    .index("by_public_id", ["publicId"])
    .index("by_host_status", ["hostUserId", "status"])
    .index("by_status_updated", ["status", "updatedAt"]),

  gamePlayers: defineTable({
    gameId: v.id("games"),
    seat: v.number(),
    userId: v.optional(v.id("users")),
    deviceId: v.optional(v.string()),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    color: v.string(),
    currentLife: v.number(),
    // Optional during the staged Phase 4.5A rollout. Counts only post-hot-path events.
    eventCount: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    // Optional during the Phase 2→3 staged migration; migrateMyGameMemberships backfills it.
    resumable: v.optional(v.boolean()),
    joinedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_seat", ["gameId", "seat"])
    .index("by_game_user", ["gameId", "userId"])
    .index("by_game_user_and_device", ["gameId", "userId", "deviceId"])
    .index("by_user", ["userId"])
    .index("by_user_resumable", ["userId", "resumable"]),

  invitations: defineTable({
    gameId: v.id("games"),
    token: v.string(),
    manualCode: v.string(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_manual_code", ["manualCode"])
    .index("by_game", ["gameId"]),

  joinAttempts: defineTable({
    clerkUserId: v.string(),
    windowStartedAt: v.number(),
    attempts: v.number(),
  }).index("by_clerk_user", ["clerkUserId"]),

  gameEvents: defineTable({
    gameId: v.id("games"),
    playerId: v.id("gamePlayers"),
    operationId: v.string(),
    kind: v.string(),
    delta: v.optional(v.number()),
    actorUserId: v.optional(v.id("users")),
    deviceId: v.optional(v.string()),
    clientCreatedAt: v.number(),
    serverCreatedAt: v.number(),
    undoOfOperationId: v.optional(v.string()),
    // Legacy global ordering only. New events use serverCreatedAt + document ID.
    sequence: v.optional(v.number()),
  })
    .index("by_game_server_time", ["gameId", "serverCreatedAt"])
    .index("by_game_operation", ["gameId", "operationId"])
    .index("by_operation_id", ["operationId"])
    .index("by_actor_user", ["actorUserId"]),

  gameSummaries: defineTable({
    gameId: v.id("games"),
    publicId: v.string(),
    finishedByUserId: v.optional(v.id("users")),
    terminalStatus: v.optional(v.union(v.literal("finished"), v.literal("abandoned"))),
    terminalReason: v.optional(v.string()),
    startingLife: v.number(),
    ruleset: v.string(),
    eventCount: v.number(),
    finishedAt: v.number(),
    players: v.array(
      v.object({
        playerId: v.id("gamePlayers"),
        seat: v.number(),
        displayName: v.string(),
        color: v.string(),
        finalLife: v.number(),
        deletedAt: v.optional(v.number()),
      }),
    ),
  })
    .index("by_game", ["gameId"])
    .index("by_public_id", ["publicId"]),

  accountDeletionRequests: defineTable({
    clerkUserId: v.string(),
    userId: v.optional(v.id("users")),
    status: v.union(v.literal("processing"), v.literal("identity_pending"), v.literal("failed")),
    attempts: v.number(),
    requestedAt: v.number(),
    updatedAt: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_clerk_user", ["clerkUserId"]),
})
