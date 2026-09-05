import type { ConnectedProjection, PendingLifeAction } from "./model"
import { CONNECTED_KEYS, ConnectedGameRepository } from "./persistence"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

class MemoryStorage {
  values = new Map<string, string>()
  getString(key: string) {
    return this.values.get(key)
  }
  getAllKeys() {
    return [...this.values.keys()]
  }
  set(key: string, value: string) {
    this.values.set(key, value)
  }
  delete(key: string) {
    this.values.delete(key)
  }
}

function action(operationId: string, queuedAt = 1, actorId = "user-1"): PendingLifeAction {
  return {
    schemaVersion: 1,
    event: {
      type: "life.changed",
      operationId: asOperationId(operationId),
      gameId: asGameId("game-public"),
      playerId: asPlayerId("player-1"),
      delta: 5,
      actorId: asActorId(actorId),
      deviceId: asDeviceId("device-1"),
      clientCreatedAt: queuedAt,
    },
    queuedAt,
    attempts: 0,
  }
}

describe("connected MMKV repository", () => {
  it("drops stored commander claims against their own player and keeps valid claims", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    for (const toPlayerId of ["player-1", "player-2"]) {
      const pending = action(`commander-claim-${toPlayerId}`)
      repository.enqueue(
        {
          ...pending,
          event: {
            ...pending.event,
            type: "commanderDamage.submitted",
            fromPlayerId: asPlayerId("player-1"),
            toPlayerId: asPlayerId(toPlayerId),
            delta: 5,
            deviceId: asDeviceId("device-valid-001"),
          },
        },
        [],
      )
    }
    expect(
      repository.loadOutbox("game-public").map((pending) => pending.event.operationId),
    ).toEqual(["commander-claim-player-2"])
  })

  it("rejects a saturated outbox before writing another pending record", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxPendingRecords: 2,
      maxPendingBytes: 10_000,
    })
    const pending = [
      action("operation-capacity-01", 1, "user-1"),
      action("operation-capacity-02", 2, "user-1"),
    ]
    repository.enqueue(pending[0], [])
    repository.enqueue(pending[1], pending.slice(0, 1))

    const result = repository.enqueue(action("operation-capacity-03", 3, "user-1"), pending)

    expect(result).toMatchObject({ accepted: false, reason: "record_limit", pending })
    expect(
      storage.getString(
        CONNECTED_KEYS.outboxRecord("game-public", "operation-capacity-03", "user-1"),
      ),
    ).toBeUndefined()
  })

  it("enforces the pending byte budget independently of the record limit", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxPendingRecords: 10,
      maxPendingBytes: 1,
    })
    const result = repository.enqueue(action("operation-byte-limit", 1, "user-1"), [])
    expect(result).toMatchObject({ accepted: false, reason: "byte_limit", pending: [] })
  })

  it("recovers durable outbox records after process death and acknowledges exactly one", () => {
    const storage = new MemoryStorage()
    new ConnectedGameRepository(storage).enqueue(action("operation-first-1", 1))
    new ConnectedGameRepository(storage).enqueue(action("operation-second", 2))
    const restarted = new ConnectedGameRepository(storage)
    expect(restarted.loadOutbox("game-public").map((item) => item.event.operationId)).toEqual([
      "operation-first-1",
      "operation-second",
    ])
    restarted.acknowledge("game-public", "operation-first-1")
    expect(restarted.loadOutbox("game-public").map((item) => item.event.operationId)).toEqual([
      "operation-second",
    ])
  })

  it("keeps client-created time as the tie-breaker for equal queue times", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    const laterClientTime = {
      ...action("operation-client-time-later", 10),
      event: { ...action("operation-client-time-later", 10).event, clientCreatedAt: 20 },
    }
    const earlierClientTime = {
      ...action("operation-client-time-earlier", 10),
      event: { ...action("operation-client-time-earlier", 10).event, clientCreatedAt: 5 },
    }
    repository.enqueue(laterClientTime)
    repository.enqueue(earlierClientTime)

    expect(repository.loadOutbox("game-public").map((item) => item.event.operationId)).toEqual([
      earlierClientTime.event.operationId,
      laterClientTime.event.operationId,
    ])
  })

  it("recovers both torn enqueue write boundaries after process death", () => {
    const storage = new MemoryStorage()
    const orphan = action("operation-orphaned", 1)
    storage.set(
      CONNECTED_KEYS.outboxRecord("game-public", "operation-orphaned"),
      JSON.stringify(orphan),
    )
    expect(new ConnectedGameRepository(storage).loadOutbox("game-public")).toEqual([orphan])

    storage.set(CONNECTED_KEYS.outboxIndex("game-public"), JSON.stringify(["operation-missing"]))
    expect(
      new ConnectedGameRepository(storage)
        .loadOutbox("game-public")
        .map((item) => item.event.operationId),
    ).toEqual(["operation-orphaned"])
    expect(JSON.parse(storage.getString(CONNECTED_KEYS.outboxIndex("game-public"))!)).toEqual([
      "operation-orphaned",
    ])
  })

  it("keeps a valid pending action when its competing failed record is corrupt", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    const pending = action("operation-corrupt-failure", 1, "user-a")
    repository.enqueue(pending, [])
    const failedKey = CONNECTED_KEYS.failedRecord(
      "game-public",
      pending.event.operationId,
      "user-a",
    )
    storage.set(failedKey, JSON.stringify({ schemaVersion: 2, action: pending }))

    expect(repository.loadOutbox("game-public")).toEqual([pending])
    expect(storage.getString(failedKey)).toBeUndefined()

    storage.set(
      failedKey,
      JSON.stringify({
        schemaVersion: 1,
        action: {
          ...pending,
          event: { ...pending.event, gameId: "game-other" },
        },
        reason: "wrong game",
        failedAt: 2,
      }),
    )
    expect(repository.loadOutbox("game-public")).toEqual([pending])
    expect(storage.getString(failedKey)).toBeUndefined()
  })

  it("migrates a legacy unversioned outbox once and rejects malformed records", () => {
    const storage = new MemoryStorage()
    const legacy = { ...action("operation-legacy"), schemaVersion: undefined }
    storage.set(
      CONNECTED_KEYS.legacyOutbox("game-public"),
      JSON.stringify([legacy, { secret: "no" }]),
    )
    const repository = new ConnectedGameRepository(storage)
    expect(repository.loadOutbox("game-public")).toHaveLength(1)
    expect(storage.getString(CONNECTED_KEYS.legacyOutbox("game-public"))).toBeUndefined()
    expect(repository.loadOutbox("game-public")).toHaveLength(1)
  })

  it("rejects explicit future pending and nested failed-action versions", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    const future = { ...action("operation-future-v2"), schemaVersion: 2 }
    storage.set(
      CONNECTED_KEYS.outboxRecord("game-public", "operation-future-v2"),
      JSON.stringify(future),
    )
    storage.set(
      CONNECTED_KEYS.failedRecord("game-public", "operation-future-v2"),
      JSON.stringify({ schemaVersion: 1, action: future, reason: "future", failedAt: 1 }),
    )
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(repository.loadFailed("game-public")).toEqual([])
  })

  it("rejects malformed persisted identifiers and non-finite timestamps", () => {
    const storage = new MemoryStorage()
    const malformed = action("operation-malformed")
    storage.set(
      CONNECTED_KEYS.outboxRecord("game-public", "operation-malformed"),
      JSON.stringify({
        ...malformed,
        event: { ...malformed.event, deviceId: "bad", clientCreatedAt: null },
      }),
    )
    expect(new ConnectedGameRepository(storage).loadOutbox("game-public")).toEqual([])
  })

  it("moves permanent failures out of pending but retains recovery details", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    repository.enqueue(action("operation-rejected"))
    repository.fail("game-public", "operation-rejected", "Game is not active", 50)
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(repository.loadFailed("game-public")[0]).toMatchObject({
      reason: "Game is not active",
      failedAt: 50,
    })
    repository.dismissFailed("game-public", "operation-rejected")
    expect(repository.loadFailed("game-public")).toEqual([])
  })

  it("keeps a rejected action pending when unresolved-failure storage is full", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxFailedRecords: 1,
      maxFailedBytes: 10_000,
    })
    const first = action("operation-failure-cap-01", 1, "user-1")
    const second = action("operation-failure-cap-02", 2, "user-1")
    repository.enqueue(first, [])
    repository.fail("game-public", first.event.operationId, "Game is not active", 10)
    repository.enqueue(second, [])

    const result = repository.failAction(
      second,
      "Game is not active",
      20,
      repository.loadFailed("game-public"),
      [second],
    )

    expect(result).toMatchObject({ accepted: false, reason: "record_limit" })
    expect(repository.loadFailed("game-public")).toHaveLength(1)
    expect(repository.loadOutbox("game-public")).toEqual([second])
  })

  it("compacts failure reasons to the versioned byte budget without dropping the failure", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxFailureReasonBytes: 16,
    })
    const rejected = action("operation-compact-reason", 1, "user-1")
    repository.enqueue(rejected, [])
    repository.fail(
      "game-public",
      rejected.event.operationId,
      "This server rejection reason is deliberately much too long",
      10,
    )
    const failure = repository.loadFailed("game-public")[0]
    expect(failure.reason.endsWith("…")).toBe(true)
    expect(Buffer.byteLength(failure.reason, "utf8")).toBeLessThanOrEqual(16)
    expect(failure.action.event.operationId).toBe(rejected.event.operationId)
  })

  it("uses dedicated records whose names cannot overlap auth token storage", () => {
    const sampleKeys = [
      CONNECTED_KEYS.projection("game"),
      CONNECTED_KEYS.outboxIndex("game"),
      CONNECTED_KEYS.outboxRecord("game", "operation"),
      CONNECTED_KEYS.failedIndex("game"),
      CONNECTED_KEYS.failedRecord("game", "operation"),
    ]
    expect(sampleKeys.join(" ")).not.toContain("token")
  })

  it("isolates prefix-related game IDs during orphan discovery", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    const longer = {
      ...action("operation-longer-game"),
      event: { ...action("operation-longer-game").event, gameId: asGameId("game.one") },
    }
    repository.enqueue(longer)
    expect(repository.loadOutbox("game")).toEqual([])
    expect(repository.loadOutbox("game.one")).toHaveLength(1)
  })

  it("isolates cached projection, pending, and failed state by Clerk subject", () => {
    const storage = new MemoryStorage()
    const accountA = new ConnectedGameRepository(storage, "user-a")
    const accountB = new ConnectedGameRepository(storage, "user-b")
    accountA.enqueue(action("operation-account-a", 1, "user-a"))
    accountB.enqueue(action("operation-account-b", 2, "user-b"))
    expect(accountB.loadOutbox("game-public").map((item) => item.event.operationId)).toEqual([
      "operation-account-b",
    ])
    expect(accountA.loadOutbox("game-public").map((item) => item.event.operationId)).toEqual([
      "operation-account-a",
    ])
  })

  it("rejects a failed record whose nested owner does not match its scoped key", () => {
    const storage = new MemoryStorage()
    const mismatched = action("operation-cross-owner", 1, "user-b")
    storage.set(
      CONNECTED_KEYS.failedRecord("game-public", mismatched.event.operationId, "user-a"),
      JSON.stringify({
        schemaVersion: 1,
        action: mismatched,
        reason: "rejected",
        failedAt: 1,
      }),
    )
    expect(new ConnectedGameRepository(storage, "user-a").loadFailed("game-public")).toEqual([])
  })

  it("rejects a failed record whose nested game does not match its scoped key", () => {
    const storage = new MemoryStorage()
    const matchingOwner = action("operation-cross-game", 1, "user-a")
    storage.set(
      CONNECTED_KEYS.failedRecord("game-public", matchingOwner.event.operationId, "user-a"),
      JSON.stringify({
        schemaVersion: 1,
        action: {
          ...matchingOwner,
          event: { ...matchingOwner.event, gameId: "other-game" },
        },
        reason: "rejected",
        failedAt: 1,
      }),
    )
    expect(new ConnectedGameRepository(storage, "user-a").loadFailed("game-public")).toEqual([])
  })

  it("persists membership-migration completion per Clerk subject", () => {
    const storage = new MemoryStorage()
    const accountA = new ConnectedGameRepository(storage, "user-a")
    const accountB = new ConnectedGameRepository(storage, "user-b")
    expect(accountA.isMembershipMigrationComplete()).toBe(false)
    accountA.markMembershipMigrationComplete()
    expect(new ConnectedGameRepository(storage, "user-a").isMembershipMigrationComplete()).toBe(
      true,
    )
    expect(accountB.isMembershipMigrationComplete()).toBe(false)
  })

  it("retains account-A legacy actions when account B migrates first", () => {
    const storage = new MemoryStorage()
    const legacyA = { ...action("operation-legacy-a", 1, "user-a"), schemaVersion: undefined }
    storage.set(CONNECTED_KEYS.legacyOutbox("game-public"), JSON.stringify([legacyA]))
    expect(new ConnectedGameRepository(storage, "user-b").loadOutbox("game-public")).toEqual([])
    expect(storage.getString(CONNECTED_KEYS.legacyOutbox("game-public"))).toBeDefined()
    expect(
      new ConnectedGameRepository(storage, "user-a")
        .loadOutbox("game-public")
        .map((item) => item.event.operationId),
    ).toEqual(["operation-legacy-a"])
    expect(storage.getString(CONNECTED_KEYS.legacyOutbox("game-public"))).toBeUndefined()
  })

  it("rejects unknown confirmed-projection schema versions", () => {
    const storage = new MemoryStorage()
    const validProjection = {
      schemaVersion: 1,
      publicId: "game-public",
      status: "active",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      isHost: true,
      eventSequence: 0,
      serverUpdatedAt: 1,
      recentOperationIds: [],
      players: [
        {
          playerId: "player-1",
          seat: 1,
          displayName: "Ada",
          color: "#111111",
          currentLife: 20,
          controlledByMe: true,
        },
        {
          playerId: "player-2",
          seat: 2,
          displayName: "Grace",
          color: "#222222",
          currentLife: 20,
          controlledByMe: false,
        },
      ],
    }
    storage.set(
      CONNECTED_KEYS.projection("game-public"),
      JSON.stringify({ ...validProjection, schemaVersion: 2 }),
    )
    expect(new ConnectedGameRepository(storage).loadProjection("game-public")).toBeNull()
    storage.set(CONNECTED_KEYS.projection("game-public"), JSON.stringify(validProjection))
    expect(new ConnectedGameRepository(storage).loadProjection("game-public")).toEqual({
      ...validProjection,
      system: "mtg",
      format: "standard",
    })
  })

  it("repairs a projection whose payload belongs to a different scoped game", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    const wrongGameProjection: ConnectedProjection = {
      schemaVersion: 1,
      publicId: "game-other",
      status: "active",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      isHost: true,
      eventSequence: 0,
      serverUpdatedAt: 1,
      recentOperationIds: [],
      players: [
        {
          playerId: "player-1",
          seat: 1,
          displayName: "Ada",
          color: "#111111",
          currentLife: 20,
          controlledByMe: true,
        },
        {
          playerId: "player-2",
          seat: 2,
          displayName: "Grace",
          color: "#222222",
          currentLife: 20,
          controlledByMe: false,
        },
      ],
    }
    const scopedKey = CONNECTED_KEYS.projection("game-public", "user-a")
    storage.set(scopedKey, JSON.stringify(wrongGameProjection))

    expect(repository.loadProjection("game-public")).toBeNull()
    expect(storage.getString(scopedKey)).toBeUndefined()
  })

  it("cleans a terminal game only after pending and failed actions are resolved", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    const terminal: ConnectedProjection = {
      schemaVersion: 1,
      publicId: "game-public",
      status: "finished",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      isHost: true,
      eventSequence: 1,
      serverUpdatedAt: 2,
      recentOperationIds: [],
      players: [
        {
          playerId: "player-1",
          seat: 1,
          displayName: "Ada",
          color: "#111111",
          currentLife: 25,
          controlledByMe: true,
        },
        {
          playerId: "player-2",
          seat: 2,
          displayName: "Grace",
          color: "#222222",
          currentLife: 20,
          controlledByMe: false,
        },
      ],
    }
    const pending = action("operation-terminal-pending", 1, "user-a")
    repository.saveProjection(terminal)
    repository.enqueue(pending, [])

    expect(repository.cleanupTerminalGame(terminal, [pending], [])).toBe(false)
    expect(repository.loadProjection("game-public")).not.toBeNull()

    repository.acknowledge("game-public", pending.event.operationId)
    const rejected = action("operation-terminal-failed", 2, "user-a")
    repository.enqueue(rejected, [])
    repository.fail("game-public", rejected.event.operationId, "Game is not active", 3)
    const retainedFailures = repository.loadFailed("game-public")
    expect(repository.cleanupTerminalGame(terminal, [], retainedFailures)).toBe(false)
    expect(repository.loadProjection("game-public")).not.toBeNull()

    repository.dismissFailed("game-public", rejected.event.operationId)
    expect(repository.cleanupTerminalGame(terminal, [], [])).toBe(true)
    expect(repository.loadProjection("game-public")).toBeNull()
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(repository.loadFailed("game-public")).toEqual([])
  })
})
