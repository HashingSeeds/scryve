import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { syncedDeckValidator, syncedVersionValidator } from "./lib/deckSync"
import { eventClock, eventPoints, eventTableResult } from "./lib/events/validators"
import { feedbackFix, feedbackKind } from "./lib/feedback"
import { playerGridLayoutValidator } from "./lib/layouts"
import { deckLabelValidator, resultOpponentValidator } from "./lib/opponentDecks"
import { pokemonBoardValidator } from "./lib/table"
import { gameVariantValidator, treacheryRoleValidator } from "./lib/treachery"

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
  commanderColor: v.optional(
    v.union(v.literal("W"), v.literal("U"), v.literal("B"), v.literal("R"), v.literal("G")),
  ),
}

const resultOutcome = v.union(
  v.literal("win"),
  v.literal("loss"),
  v.literal("draw"),
  v.literal("unknown"),
)

const matchSeat = v.object({
  seat: v.number(),
  displayName: v.string(),
  userId: v.optional(v.id("users")),
  deckId: v.optional(v.id("decks")),
  deckVersionId: v.optional(v.id("deckVersions")),
  deckName: v.optional(v.string()),
  deckKey: v.optional(v.string()),
  deckFingerprint: v.optional(v.string()),
  deckLabel: v.optional(deckLabelValidator),
  gamesWon: v.optional(v.number()),
  gamesDrawn: v.optional(v.number()),
  outcome: v.optional(resultOutcome),
  deletedAt: v.optional(v.number()),
})

const manualRecordValidator = v.object({
  total: v.number(),
  wins: v.number(),
  losses: v.number(),
  draws: v.number(),
  unknown: v.number(),
})

const manualStatsFields = {
  manualMatches: v.optional(manualRecordValidator),
  manualGames: v.optional(manualRecordValidator),
  connectedMatches: v.optional(manualRecordValidator),
}

const matchFields = {
  publicId: v.string(),
  ownerUserId: v.optional(v.id("users")),
  bestOf: v.union(v.literal(1), v.literal(3), v.literal(5)),
  system: v.optional(v.string()),
  format: v.optional(v.string()),
  // why: an embedded array is safe because writers cap seats at MAX_PLAYERS.
  seats: v.array(matchSeat),
  eventName: v.optional(v.string()),
  roundNumber: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}

export default defineSchema({
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
    mode: v.union(v.literal("connected"), v.literal("local")),
    status: v.union(
      v.literal("lobby"),
      v.literal("active"),
      v.literal("finished"),
      v.literal("abandoned"),
    ),
    playerCount: v.number(),
    startingLife: v.number(),
    lifeStep: v.optional(v.number()),
    ruleset: v.string(),
    deckRequired: v.optional(v.boolean()),
    game: v.optional(v.string()),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    variant: v.optional(gameVariantValidator),
    layout: v.optional(playerGridLayoutValidator),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    updatedAt: v.number(),
    currentInvitationId: v.optional(v.id("invitations")),
    rematchPublicId: v.optional(v.string()),
    rematchOfGameId: v.optional(v.id("games")),
    matchId: v.optional(v.id("matches")),
    matchGameNumber: v.optional(v.number()),
    // Reserved for a future event stream without enabling connected mutations in Phase 2.
    // Legacy event-count base. New life writes never patch this shared row.
    eventSequence: v.optional(v.number()),
    designations: v.optional(v.record(v.string(), v.id("gamePlayers"))),
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
    deckKey: v.optional(v.string()),
    deckFingerprint: v.optional(v.string()),
    deckLabel: v.optional(deckLabelValidator),
    deletedAt: v.optional(v.number()),
    color: v.string(),
    shape: v.optional(v.string()),
    // why: installed clients only draw `shape`, so a Pro mark rides beside a free one they can still render.
    proShape: v.optional(v.string()),
    foil: v.optional(v.boolean()),
    currentLife: v.number(),
    startingLife: v.optional(v.number()),
    // Optional during the staged Phase 4.5A rollout. Counts only post-hot-path events.
    eventCount: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    // Optional during the Phase 2→3 staged migration; migrateMyGameMemberships backfills it.
    resumable: v.optional(v.boolean()),
    joinedAt: v.number(),
    counters: v.optional(v.record(v.string(), v.number())),
    pokemon: v.optional(pokemonBoardValidator),
    // why: other seats must not see a role until it is revealed or the game ends; only roleForViewer projects it.
    role: v.optional(treacheryRoleValidator),
    roleRevealed: v.optional(v.boolean()),
    seatPassHash: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_game_seat", ["gameId", "seat"])
    .index("by_game_user", ["gameId", "userId"])
    .index("by_seat_pass_hash", ["seatPassHash"])
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
    kind: v.optional(v.literal("seatLookup")),
    failedInvite: v.optional(v.string()),
    failedInviteAt: v.optional(v.number()),
  })
    .index("by_clerk_user", ["clerkUserId"])
    .index("by_clerk_user_kind", ["clerkUserId", "kind"]),

  gamePublishReceipts: defineTable({
    ownerUserId: v.id("users"),
    operationId: v.string(),
    requestKey: v.string(),
    publicId: v.string(),
    manualCode: v.string(),
    expiresAt: v.number(),
    players: v.array(
      v.object({
        localId: v.string(),
        playerId: v.id("gamePlayers"),
        seat: v.number(),
      }),
    ),
  }).index("by_owner_and_operation_id", ["ownerUserId", "operationId"]),

  gameEvents: defineTable({
    gameId: v.id("games"),
    playerId: v.id("gamePlayers"),
    operationId: v.string(),
    kind: v.string(),
    delta: v.optional(v.number()),
    fromPlayerId: v.optional(v.id("gamePlayers")),
    toPlayerId: v.optional(v.id("gamePlayers")),
    commander: v.optional(v.literal(1)),
    claimOperationId: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    deviceId: v.optional(v.string()),
    clientCreatedAt: v.number(),
    serverCreatedAt: v.number(),
    undoOfOperationId: v.optional(v.string()),
    // why: table actions keep the canonical action they were sent with, so a replayed operation id must carry the same action.
    actionIdentity: v.optional(v.string()),
    // Legacy global ordering only. New events use serverCreatedAt + document ID.
    sequence: v.optional(v.number()),
  })
    .index("by_game_server_time", ["gameId", "serverCreatedAt"])
    .index("by_game_operation", ["gameId", "operationId"])
    .index("by_actor_user", ["actorUserId"]),

  // One row per commander/defender pair keeps totals bounded and avoids replaying the event log.
  gameCommanderDamage: defineTable({
    gameId: v.id("games"),
    fromPlayerId: v.id("gamePlayers"),
    toPlayerId: v.id("gamePlayers"),
    commander: v.optional(v.literal(1)),
    total: v.number(),
    updatedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_pair", ["gameId", "fromPlayerId", "toPlayerId"])
    .index("by_game_pair_and_commander", ["gameId", "fromPlayerId", "toPlayerId", "commander"]),

  // Pending rows are short-lived operational state; resolved rows remain as a bounded audit trail
  // only for the lifetime of the game and are never used to calculate totals.
  gameCommanderClaims: defineTable({
    gameId: v.id("games"),
    operationId: v.string(),
    resolutionOperationId: v.optional(v.string()),
    fromPlayerId: v.id("gamePlayers"),
    toPlayerId: v.id("gamePlayers"),
    commander: v.optional(v.literal(1)),
    delta: v.number(),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("declined")),
    actorUserId: v.optional(v.id("users")),
    deviceId: v.optional(v.string()),
    clientCreatedAt: v.number(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id("users")),
  })
    .index("by_game_operation", ["gameId", "operationId"])
    .index("by_game_and_status", ["gameId", "status"])
    .index("by_actor_user", ["actorUserId"])
    .index("by_resolved_by_user", ["resolvedByUserId"]),

  gameSummaries: defineTable({
    firstPlayerId: v.optional(v.id("gamePlayers")),
    clientGameId: v.optional(v.string()),
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
        localId: v.optional(v.string()),
        resultId: v.optional(v.string()),
        deckKey: v.optional(v.string()),
        deckFingerprint: v.optional(v.string()),
        deckLabel: v.optional(deckLabelValidator),
        seat: v.number(),
        displayName: v.string(),
        userId: v.optional(v.id("users")),
        usernameAtFinish: v.optional(v.string()),
        deckId: v.optional(v.id("decks")),
        deckVersionId: v.optional(v.id("deckVersions")),
        deckNameAtFinish: v.optional(v.string()),
        deckVersionNumber: v.optional(v.number()),
        outcome: v.optional(resultOutcome),
        color: v.string(),
        shape: v.optional(v.string()),
        finalLife: v.number(),
        deletedAt: v.optional(v.number()),
      }),
    ),
    resultKind: v.optional(v.union(v.literal("win"), v.literal("draw"), v.literal("unknown"))),
    winnerPlayerIds: v.optional(v.array(v.id("gamePlayers"))),
    matchId: v.optional(v.id("matches")),
  })
    .index("by_game", ["gameId"])
    .index("by_public_id", ["publicId"]),

  gameCompletionReceipts: defineTable({
    hostUserId: v.id("users"),
    gameId: v.id("games"),
    operationId: v.string(),
    requestKey: v.string(),
    ack: v.object({
      publicId: v.string(),
      summaryId: v.id("gameSummaries"),
      finishedAt: v.number(),
    }),
  }).index("by_host_and_operation_id", ["hostUserId", "operationId"]),

  gameHistoryEntries: defineTable(
    v.union(
      v.object({
        userId: v.id("users"),
        source: v.optional(v.union(v.literal("connected"), v.literal("local"))),
        gameId: v.id("games"),
        summaryId: v.id("gameSummaries"),
        matchId: v.optional(v.id("matches")),
        finishedAt: v.number(),
        outcome: resultOutcome,
      }),
      v.object({
        userId: v.id("users"),
        source: v.literal("manual"),
        matchId: v.id("matches"),
        finishedAt: v.number(),
        outcome: resultOutcome,
      }),
    ),
  )
    .index("by_user_and_finished_at", ["userId", "finishedAt"])
    .index("by_user_and_game", ["userId", "gameId"]),

  decks: defineTable({
    deckKey: v.string(),
    movedToDeviceAt: v.optional(v.number()),
    ownerUserId: v.id("users"),
    syncId: v.optional(v.string()),
    syncRevision: v.optional(v.number()),
    guestLocalId: v.optional(v.string()),
    guestUpdatedAt: v.optional(v.number()),
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
    favoritedAt: v.optional(v.number()),
    // why: unset or pointing at a deleted version means the player brings the latest version.
    bringingVersionId: v.optional(v.id("deckVersions")),
    // why: archivedAt means deleted. The name predates unsynced decks and stays for installed clients.
    archivedAt: v.optional(v.number()),
    unsyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerUserId", "updatedAt"])
    .index("by_owner_and_archived_at", ["ownerUserId", "archivedAt"])
    .index("by_owner_and_archived_at_and_unsynced_at", {
      fields: ["ownerUserId", "archivedAt", "unsyncedAt"],
      staged: true,
    })
    .index("by_owner_and_guest_local_id", ["ownerUserId", "guestLocalId"])
    .index("by_owner_and_sync_id", ["ownerUserId", "syncId"])
    .index("by_owner_and_deck_key", ["ownerUserId", "deckKey"]),

  deckSyncReceipts: defineTable({
    ownerUserId: v.id("users"),
    operationId: v.string(),
    requestKey: v.string(),
    result: syncedDeckValidator,
  }).index("by_owner_and_operation_id", ["ownerUserId", "operationId"]),

  deckVersionSyncReceipts: defineTable({
    ownerUserId: v.id("users"),
    operationId: v.string(),
    requestKey: v.string(),
    result: syncedVersionValidator,
  }).index("by_owner_and_operation_id", ["ownerUserId", "operationId"]),
  deckVersions: defineTable({
    deckId: v.id("decks"),
    versionNumber: v.number(),
    fingerprint: v.string(),
    syncRevision: v.optional(v.number()),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    cardCount: v.optional(v.number()),
    cardQuantity: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_deck_and_version_number", ["deckId", "versionNumber"])
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
  }).index("by_deck_version", ["deckVersionId"]),

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
    .index("by_game_card_id", ["gameCardId"])
    .index("by_game_and_printing_id", ["game", "printingId"]),

  cardDatasetSyncs: defineTable({
    game: v.string(),
    version: v.optional(v.string()),
    pending: v.optional(
      v.object({
        version: v.string(),
        nextIndex: v.number(),
        startedAt: v.number(),
        sweepCursor: v.optional(v.string()),
      }),
    ),
  }).index("by_game", ["game"]),

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
    .index("by_game_and_format_and_fetched_at", ["game", "format", "fetchedAt"])
    .index("by_game_and_format_and_kind_and_fetched_at", ["game", "format", "kind", "fetchedAt"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["game", "kind"] })
    .searchIndex("search_name_by_format", {
      searchField: "name",
      filterFields: ["game", "format", "kind"],
    }),

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
  }).index("by_catalog_deck_id", ["catalogDeckId"]),

  deckGameResults: defineTable({
    deckId: v.id("decks"),
    deckVersionId: v.id("deckVersions"),
    gameId: v.id("games"),
    playerId: v.id("gamePlayers"),
    userId: v.id("users"),
    outcome: resultOutcome,
    finishedAt: v.number(),
  }).index("by_user", ["userId"]),

  matches: defineTable(
    v.union(
      v.object({
        ...matchFields,
        source: v.literal("connected"),
        status: v.union(v.literal("active"), v.literal("finished"), v.literal("abandoned")),
        // why: drawn games don't count toward bestOf, so writers cap this length separately.
        gameIds: v.array(v.id("games")),
        finishedAt: v.optional(v.number()),
      }),
      v.object({
        ...matchFields,
        source: v.literal("manual"),
        finishedAt: v.number(),
      }),
    ),
  )
    .index("by_public_id", ["publicId"])
    .index("by_owner_user", ["ownerUserId"]),

  deckMatchResults: defineTable({
    deckId: v.id("decks"),
    deckVersionId: v.id("deckVersions"),
    matchId: v.id("matches"),
    userId: v.id("users"),
    source: v.union(v.literal("connected"), v.literal("manual")),
    outcome: resultOutcome,
    finishedAt: v.number(),
  }).index("by_user", ["userId"]),

  deckVersionStats: defineTable({
    deckId: v.id("decks"),
    deckVersionId: v.id("deckVersions"),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    unknown: v.number(),
    ...manualStatsFields,
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
    ...manualStatsFields,
    updatedAt: v.number(),
  }).index("by_deck", ["deckId"]),

  deckResults: defineTable({
    wentFirst: v.optional(v.boolean()),
    resultId: v.string(),
    userId: v.id("users"),
    deckKey: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    kind: v.union(v.literal("game"), v.literal("match")),
    source: v.union(
      v.literal("local"),
      v.literal("nearby"),
      v.literal("connected"),
      v.literal("manual"),
    ),
    outcome: resultOutcome,
    finishedAt: v.number(),
    summaryId: v.optional(v.id("gameSummaries")),
    matchId: v.optional(v.id("matches")),
    deltas: v.object({ games: v.optional(manualRecordValidator), ...manualStatsFields }),
    legacyDeckId: v.optional(v.id("decks")),
    podSize: v.optional(v.number()),
    deckVersionId: v.optional(v.id("deckVersions")),
    // why: an embedded array is safe because a game or match holds at most MAX_PLAYERS seats.
    opponents: v.optional(v.array(resultOpponentValidator)),
  })
    .index("by_user_and_result_id", ["userId", "resultId"])
    .index("by_user_and_finished_at", ["userId", "finishedAt"])
    .index("by_user_and_deck_key_and_finished_at", ["userId", "deckKey", "finishedAt"]),

  deckKeyStats: defineTable({
    userId: v.id("users"),
    deckKey: v.string(),
    fingerprint: v.string(),
    games: v.number(),
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),
    unknown: v.number(),
    ...manualStatsFields,
    updatedAt: v.number(),
  })
    .index("by_user_and_deck_key_and_fingerprint", ["userId", "deckKey", "fingerprint"])
    .index("by_user_and_fingerprint", ["userId", "fingerprint"]),

  cardNameCatalogs: defineTable({
    game: v.string(),
    fetchedAt: v.number(),
    names: v.string(),
    alternateNames: v.string(),
    refreshingUntil: v.optional(v.number()),
  }).index("by_game", ["game"]),

  cardReferences: defineTable({
    commanderEligibility: v.optional(
      v.union(v.literal("eligible"), v.literal("ineligible"), v.literal("color-choice")),
    ),
    commanderLegality: v.optional(v.string()),
    colorIdentity: v.optional(v.string()),
    scryfallId: v.string(),
    oracleId: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    smallImageUrl: v.optional(v.string()),
    manaCost: v.optional(v.string()),
    typeLine: v.optional(v.string()),
    oracleText: v.optional(v.string()),
    keywords: v.optional(v.string()),
    faceDetails: v.optional(v.string()),
    setName: v.optional(v.string()),
    setCode: v.optional(v.string()),
    collectorNumber: v.optional(v.string()),
    rarity: v.optional(v.string()),
    power: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_scryfall_id", ["scryfallId"])
    .index("by_name", ["name"]),

  scryfallImageFallbacks: defineTable({
    oracleId: v.string(),
    urls: v.array(v.string()),
    fetchedAt: v.number(),
  }).index("by_oracle_id", ["oracleId"]),

  preconCatalogs: defineTable({
    fetchedAt: v.number(),
    refreshRequestedAt: v.optional(v.number()),
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

  revenueCatCustomerStates: defineTable({
    appUserId: v.string(),
    enabled: v.boolean(),
    foil: v.optional(v.boolean()),
    environment: v.union(v.literal("PRODUCTION"), v.literal("SANDBOX")),
    observedAt: v.number(),
    renewsAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_app_user_id", ["appUserId"])
    .index("by_renews_at", ["renewsAt"]),

  revenueCatWebhookEvents: defineTable({
    eventId: v.string(),
    eventTimestampMs: v.number(),
    environment: v.optional(v.union(v.literal("PRODUCTION"), v.literal("SANDBOX"))),
    processedAt: v.number(),
  }).index("by_event_id", ["eventId"]),

  legalAcceptances: defineTable({
    clerkUserId: v.string(),
    document: v.union(v.literal("terms"), v.literal("privacy")),
    version: v.string(),
    platform: v.string(),
    acceptedAt: v.number(),
  })
    .index("by_clerk_user", ["clerkUserId"])
    .index("by_clerk_user_and_document", ["clerkUserId", "document"]),

  storeReleases: defineTable({
    platform: v.union(v.literal("ios"), v.literal("android")),
    version: v.string(),
    runtimeVersion: v.string(),
    commitAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_platform", ["platform"]),

  moderationReports: defineTable({
    reporterUserId: v.optional(v.id("users")),
    reportedUserId: v.optional(v.id("users")),
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
    retentionExpiresAt: v.optional(v.number()),
    legalHoldUntil: v.optional(v.number()),
  })
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_reported_user", ["reportedUserId"])
    .index("by_reporter_and_reported", ["reporterUserId", "reportedUserId"])
    .index("by_retention_expires_at", ["retentionExpiresAt"]),

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
    deletedIdentityHash: v.optional(v.string()),
    token: v.string(),
    status: v.union(
      v.literal("processing"),
      v.literal("identity_pending"),
      v.literal("failed"),
      v.literal("completed"),
    ),
    requestedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_deleted_identity_hash", ["deletedIdentityHash"]),

  feedbackRequests: defineTable({
    kind: feedbackKind,
    body: v.string(),
    senderHash: v.string(),
    userId: v.optional(v.id("users")),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
    sentryEventId: v.optional(v.string()),
    runtimeVersion: v.optional(v.string()),
    issue: v.optional(v.number()),
    fixedIn: v.optional(feedbackFix),
    awaitingStore: v.optional(v.union(v.literal("ios"), v.literal("android"))),
    unread: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_sender_and_updated_at", ["senderHash", "updatedAt"])
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
    .index("by_issue_and_fixed_in", ["issue", "fixedIn"])
    .index("by_awaiting_store", ["awaitingStore"]),

  feedbackMessages: defineTable({
    requestId: v.id("feedbackRequests"),
    from: v.union(v.literal("player"), v.literal("team")),
    body: v.string(),
  }).index("by_request", ["requestId"]),

  feedbackApolloCursor: defineTable({ after: v.number() }),
  pushDevices: defineTable({
    senderHash: v.string(),
    userId: v.optional(v.id("users")),
    token: v.string(),
    locale: v.optional(v.string()),
    feedbackReplies: v.boolean(),
    renewalReminders: v.boolean(),
  })
    .index("by_sender_hash", ["senderHash"])
    .index("by_user_id", ["userId"])
    .index("by_token", ["token"]),
  events: defineTable({
    // why: optional so account deletion can detach an organizer without deleting other players' standings.
    ownerUserId: v.optional(v.id("users")),
    code: v.string(),
    name: v.string(),
    system: v.string(),
    format: v.string(),
    structure: v.union(v.literal("swiss"), v.literal("pods")),
    bestOf: v.union(v.literal(1), v.literal(3), v.literal(5)),
    points: eventPoints,
    plannedRounds: v.number(),
    roundMinutes: v.number(),
    status: v.union(v.literal("registration"), v.literal("active"), v.literal("finished")),
    round: v.number(),
    clock: v.optional(eventClock),
    playerCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    nearbyId: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_owner_user_and_status", ["ownerUserId", "status"])
    .index("by_owner_user_and_nearby_id", ["ownerUserId", "nearbyId"]),

  eventPlayers: defineTable({
    eventId: v.id("events"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    droppedAt: v.optional(v.number()),
    joinedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_and_user", ["eventId", "userId"])
    .index("by_user", ["userId"]),

  eventTables: defineTable({
    eventId: v.id("events"),
    round: v.number(),
    table: v.number(),
    playerIds: v.array(v.id("eventPlayers")),
    status: v.union(v.literal("open"), v.literal("reported"), v.literal("confirmed")),
    result: v.optional(eventTableResult),
    reportedBy: v.optional(v.id("eventPlayers")),
    updatedAt: v.number(),
  }).index("by_event_and_round", ["eventId", "round"]),
})
