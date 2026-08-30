import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const genericDeckCardFields = {
  game: v.optional(v.string()),
  identityNamespace: v.optional(v.string()),
  cardId: v.optional(v.string()),
  providerCardId: v.optional(v.string()),
  printingId: v.optional(v.string()),
  section: v.optional(v.string()),
  entryKind: v.optional(v.string()),
  originalReference: v.optional(v.string()),
  category: v.optional(v.string()),
}

const legacyMagicDeckCardFields = {
  oracleId: v.optional(v.string()),
  scryfallId: v.optional(v.string()),
}

export default defineSchema({
  waitlistSubmissions: defineTable({
    email: v.string(),
    platforms: v.array(v.union(v.literal("web"), v.literal("ios"), v.literal("android"))),
    status: v.union(
      v.literal("waiting"),
      v.literal("invited"),
      v.literal("onboarded"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    invitedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_status_and_created_at", ["status", "createdAt"]),

  users: defineTable({
    clerkUserId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    usernameNormalized: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    // Set when moderation pulls a username. While present, every surface other players can see
    // shows `placeholderUsername` instead of the name Clerk holds.
    moderationHold: v.optional(
      v.object({
        placeholderUsername: v.string(),
        heldUsername: v.string(),
        reason: v.union(v.literal("filter"), v.literal("reports"), v.literal("operator")),
        createdAt: v.number(),
      }),
    ),
    membershipMigrationVersion: v.optional(v.number()),
    membershipMigrationCursor: v.optional(v.string()),
    historyMigrationVersion: v.optional(v.number()),
    historyMigrationCursor: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user", ["clerkUserId"])
    .index("by_username_normalized", ["usernameNormalized"]),

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
    game: v.optional(v.string()),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
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
    usernameAtJoin: v.optional(v.string()),
    deckVersionId: v.optional(v.id("deckVersions")),
    deletedAt: v.optional(v.number()),
    color: v.string(),
    shape: v.optional(v.string()),
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
    game: v.optional(v.string()),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    eventCount: v.number(),
    finishedAt: v.number(),
    players: v.array(
      v.object({
        playerId: v.id("gamePlayers"),
        seat: v.number(),
        displayName: v.string(),
        userId: v.optional(v.id("users")),
        usernameAtFinish: v.optional(v.string()),
        deckId: v.optional(v.id("decks")),
        deckVersionId: v.optional(v.id("deckVersions")),
        deckNameAtFinish: v.optional(v.string()),
        deckVersionNumber: v.optional(v.number()),
        outcome: v.optional(
          v.union(v.literal("win"), v.literal("loss"), v.literal("draw"), v.literal("unknown")),
        ),
        color: v.string(),
        shape: v.optional(v.string()),
        finalLife: v.number(),
        deletedAt: v.optional(v.number()),
      }),
    ),
    resultKind: v.optional(v.union(v.literal("win"), v.literal("draw"), v.literal("unknown"))),
    winnerPlayerIds: v.optional(v.array(v.id("gamePlayers"))),
  })
    .index("by_game", ["gameId"])
    .index("by_public_id", ["publicId"]),

  gameHistoryEntries: defineTable({
    userId: v.id("users"),
    gameId: v.id("games"),
    summaryId: v.id("gameSummaries"),
    finishedAt: v.number(),
    outcome: v.union(v.literal("win"), v.literal("loss"), v.literal("draw"), v.literal("unknown")),
  })
    .index("by_user_and_finished_at", ["userId", "finishedAt"])
    .index("by_user_and_game", ["userId", "gameId"]),

  decks: defineTable({
    ownerUserId: v.id("users"),
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
    favoritedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerUserId", "updatedAt"])
    .index("by_owner_and_archived_at", ["ownerUserId", "archivedAt"]),

  deckVersions: defineTable({
    deckId: v.id("decks"),
    versionNumber: v.number(),
    fingerprint: v.string(),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    cardCount: v.optional(v.number()),
    cardQuantity: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_deck_and_version_number", ["deckId", "versionNumber"])
    .index("by_deck_and_created_at", ["deckId", "createdAt"])
    .index("by_deck_and_archived_at", ["deckId", "archivedAt"]),

  deckCards: defineTable({
    deckVersionId: v.id("deckVersions"),
    ...genericDeckCardFields,
    ...legacyMagicDeckCardFields,
    name: v.string(),
    imageUrl: v.optional(v.string()),
    smallImageUrl: v.optional(v.string()),
    quantity: v.number(),
    board: v.optional(v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander"))),
  })
    .index("by_deck_version", ["deckVersionId"])
    .index("by_game_and_printing_id", ["game", "printingId"]),

  gameCards: defineTable({
    game: v.string(),
    identityNamespace: v.string(),
    cardId: v.string(),
    name: v.string(),
    nameNormalized: v.string(),
    category: v.optional(v.string()),
    facets: v.array(v.object({ key: v.string(), value: v.string() })),
    updatedAt: v.number(),
  })
    .index("by_game_and_identity_namespace_and_card_id", ["game", "identityNamespace", "cardId"])
    .index("by_game_and_name_normalized", ["game", "nameNormalized"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["game"] }),

  cardPrintings: defineTable({
    gameCardId: v.id("gameCards"),
    game: v.string(),
    provider: v.string(),
    providerCardId: v.string(),
    printingId: v.string(),
    setCode: v.optional(v.string()),
    collectorNumber: v.optional(v.string()),
    language: v.optional(v.string()),
    rarity: v.optional(v.string()),
    typeLabel: v.optional(v.string()),
    costLabel: v.optional(v.string()),
    faces: v.array(
      v.object({
        index: v.number(),
        name: v.optional(v.string()),
        text: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        smallImageUrl: v.optional(v.string()),
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_game_and_provider_and_provider_card_id", ["game", "provider", "providerCardId"])
    .index("by_game_card_id", ["gameCardId"])
    .index("by_game_and_printing_id", ["game", "printingId"]),

  providerHealth: defineTable({
    game: v.string(),
    provider: v.string(),
    operation: v.string(),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("unavailable")),
    lastAttemptAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    responseMs: v.optional(v.number()),
    httpStatus: v.optional(v.number()),
    message: v.string(),
    updatedAt: v.number(),
  }).index("by_game_and_provider_and_operation", ["game", "provider", "operation"]),

  integrationOverrides: defineTable({
    game: v.string(),
    capability: v.string(),
    release: v.union(v.literal("enabled"), v.literal("permission_required"), v.literal("disabled")),
    note: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_game_and_capability", ["game", "capability"]),

  deckCatalogs: defineTable({
    game: v.string(),
    source: v.string(),
    externalId: v.string(),
    kind: v.string(),
    name: v.string(),
    format: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    fetchedAt: v.number(),
  })
    .index("by_game_and_source_and_external_id", ["game", "source", "externalId"])
    .index("by_game_and_fetched_at", ["game", "fetchedAt"])
    .index("by_game_and_kind_and_fetched_at", ["game", "kind", "fetchedAt"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["game", "kind"] }),

  deckCatalogCards: defineTable({
    catalogDeckId: v.id("deckCatalogs"),
    game: v.string(),
    identityNamespace: v.optional(v.string()),
    cardId: v.optional(v.string()),
    providerCardId: v.optional(v.string()),
    printingId: v.optional(v.string()),
    name: v.string(),
    quantity: v.number(),
    section: v.string(),
    entryKind: v.string(),
    originalReference: v.optional(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    smallImageUrl: v.optional(v.string()),
  })
    .index("by_catalog_deck_id", ["catalogDeckId"])
    .index("by_game_and_printing_id", ["game", "printingId"]),

  deckGameResults: defineTable({
    deckId: v.id("decks"),
    deckVersionId: v.id("deckVersions"),
    gameId: v.id("games"),
    playerId: v.id("gamePlayers"),
    userId: v.id("users"),
    outcome: v.union(v.literal("win"), v.literal("loss"), v.literal("draw"), v.literal("unknown")),
    finishedAt: v.number(),
  })
    .index("by_deck_and_finished_at", ["deckId", "finishedAt"])
    .index("by_version_and_finished_at", ["deckVersionId", "finishedAt"])
    .index("by_user", ["userId"])
    .index("by_game_and_player", ["gameId", "playerId"]),

  deckVersionStats: defineTable({
    deckId: v.id("decks"),
    deckVersionId: v.id("deckVersions"),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    unknown: v.number(),
    updatedAt: v.number(),
  })
    .index("by_version", ["deckVersionId"])
    .index("by_deck", ["deckId"]),

  deckStats: defineTable({
    deckId: v.id("decks"),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    unknown: v.number(),
    updatedAt: v.number(),
  }).index("by_deck", ["deckId"]),

  cardReferences: defineTable({
    scryfallId: v.string(),
    oracleId: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    smallImageUrl: v.optional(v.string()),
    manaCost: v.optional(v.string()),
    typeLine: v.optional(v.string()),
    oracleText: v.optional(v.string()),
    setName: v.optional(v.string()),
    setCode: v.optional(v.string()),
    collectorNumber: v.optional(v.string()),
    rarity: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_scryfall_id", ["scryfallId"])
    .index("by_oracle_id", ["oracleId"]),

  preconCatalogs: defineTable({
    fetchedAt: v.number(),
    decks: v.array(
      v.object({
        fileName: v.string(),
        name: v.string(),
        code: v.optional(v.string()),
        releaseDate: v.optional(v.string()),
        type: v.optional(v.string()),
      }),
    ),
  }),

  resolvedPreconstructedDecks: defineTable({
    fileName: v.string(),
    name: v.string(),
    cards: v.array(
      v.object({
        oracleId: v.string(),
        scryfallId: v.string(),
        name: v.string(),
        imageUrl: v.optional(v.string()),
        smallImageUrl: v.optional(v.string()),
        quantity: v.number(),
        board: v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander")),
      }),
    ),
    unresolved: v.array(v.string()),
    fetchedAt: v.number(),
    refreshingUntil: v.optional(v.number()),
    refreshClaimId: v.optional(v.string()),
  })
    .index("by_file_name", ["fileName"])
    .index("by_fetched_at", ["fetchedAt"]),

  preconstructedDeckOutlines: defineTable({
    fileName: v.string(),
    name: v.string(),
    cards: v.array(
      v.object({
        name: v.string(),
        quantity: v.number(),
        board: v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander")),
        scryfallId: v.optional(v.string()),
      }),
    ),
    fetchedAt: v.number(),
  })
    .index("by_file_name", ["fileName"])
    .index("by_fetched_at", ["fetchedAt"]),

  preconstructedDeckFetches: defineTable({
    fileName: v.string(),
    claimId: v.string(),
    leaseUntil: v.number(),
  }).index("by_file_name", ["fileName"]),

  externalApiRateLimits: defineTable({
    bucket: v.string(),
    nextRequestAt: v.number(),
  }).index("by_bucket", ["bucket"]),

  userEntitlements: defineTable({
    userId: v.id("users"),
    feature: v.string(),
    enabled: v.boolean(),
    source: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_and_feature", ["userId", "feature"])
    .index("by_user", ["userId"]),

  legalAcceptances: defineTable({
    clerkUserId: v.string(),
    document: v.union(v.literal("terms"), v.literal("privacy")),
    version: v.string(),
    platform: v.string(),
    acceptedAt: v.number(),
  })
    .index("by_clerk_user", ["clerkUserId"])
    .index("by_clerk_user_and_document", ["clerkUserId", "document"]),

  moderationReports: defineTable({
    reporterUserId: v.id("users"),
    reportedUserId: v.id("users"),
    gameId: v.optional(v.id("games")),
    reportedUsername: v.string(),
    reason: v.union(
      v.literal("offensive_username"),
      v.literal("harassment"),
      v.literal("impersonation"),
      v.literal("other"),
    ),
    note: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("upheld"), v.literal("dismissed")),
    autoAction: v.optional(v.union(v.literal("held_on_filter"), v.literal("held_on_reports"))),
    matchedTerms: v.optional(v.array(v.string())),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_reported_user", ["reportedUserId"])
    .index("by_reporter_and_reported", ["reporterUserId", "reportedUserId"]),

  userBlocks: defineTable({
    blockerUserId: v.id("users"),
    blockedUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blocker", ["blockerUserId"])
    .index("by_blocker_and_blocked", ["blockerUserId", "blockedUserId"])
    .index("by_blocked", ["blockedUserId"]),

  accountDeletionRequests: defineTable({
    clerkUserId: v.string(),
    userId: v.optional(v.id("users")),
    receiptId: v.optional(v.id("accountDeletionReceipts")),
    status: v.union(v.literal("processing"), v.literal("identity_pending"), v.literal("failed")),
    attempts: v.number(),
    requestedAt: v.number(),
    updatedAt: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_clerk_user", ["clerkUserId"]),

  accountDeletionReceipts: defineTable({
    token: v.string(),
    status: v.union(
      v.literal("processing"),
      v.literal("identity_pending"),
      v.literal("failed"),
      v.literal("completed"),
    ),
    requestedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_token", ["token"]),
})
