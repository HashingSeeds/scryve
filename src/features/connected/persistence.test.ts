import type { ResumableGame } from "./connectedCopy"
import type { ConnectedProjection, PendingLifeAction } from "./model"
import { toConnectedProjection } from "./model"
import {
  CONNECTED_KEYS,
  ConnectedGameRepository,
  RESUME_INDEX_LIMIT,
  hasAnyResumeGame,
  loadNewestResumeGame,
  removeResumeEntryEverywhere,
  subscribeResumeIndex,
} from "./persistence"
import { sendQueuedAction } from "./useConnectedGame"
import { projection } from "../../../test/fixtures/connectedProjection"
import { MemoryStorage } from "../../../test/support/memoryStorage"
import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  PARTNER_COMMANDER,
} from "../game/domain"
import { storedPlaySystem } from "../game/playSystems"
import { setOutboxWriter } from "../sync/durableOutbox"

function queue(repository: ConnectedGameRepository, queued: PendingLifeAction) {
  return repository.outbox(queued.event.gameId).enqueue(queued)
}

function stored(repository: ConnectedGameRepository, gameId = "game-public") {
  return repository.outbox(gameId).getState()
}

async function rejectQueued(repository: ConnectedGameRepository, reason: string, failedAt: number) {
  const outbox = repository.outbox("game-public", {
    send: () => Promise.reject(new Error(reason)),
    rejectReason: () => reason,
    backoff: { baseMs: 250, maxMs: 8_000 },
    now: () => failedAt,
  })
  const stop = outbox.start()
  await new Promise(setImmediate)
  stop()
  return outbox.getState()
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
      queue(repository, {
        ...pending,
        event: {
          ...pending.event,
          type: "commanderDamage.submitted",
          fromPlayerId: asPlayerId("player-1"),
          toPlayerId: asPlayerId(toPlayerId),
          delta: 5,
          deviceId: asDeviceId("device-valid-001"),
        },
      })
    }
    expect(stored(repository).pending.map((pending) => pending.event.operationId)).toEqual([
      "commander-claim-player-2",
    ])
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
    const outbox = repository.outbox("game-public")
    outbox.enqueue(pending[0])
    outbox.enqueue(pending[1])

    expect(outbox.enqueue(action("operation-capacity-03", 3, "user-1"))).toBe(false)
    expect(outbox.getState().pending).toEqual(pending)
    expect(
      storage.getString(
        CONNECTED_KEYS.outboxRecord("game-public", "operation-capacity-03", "user-1"),
      ),
    ).toBeUndefined()
  })

  it("recovers durable outbox records after process death and acknowledges exactly one", () => {
    const storage = new MemoryStorage()
    queue(new ConnectedGameRepository(storage), action("operation-first-1", 1))
    queue(new ConnectedGameRepository(storage), action("operation-second", 2))
    const restarted = new ConnectedGameRepository(storage)
    expect(stored(restarted).pending.map((item) => item.event.operationId)).toEqual([
      "operation-first-1",
      "operation-second",
    ])
    restarted.outbox("game-public").acknowledge(["operation-first-1"])
    expect(stored(restarted).pending.map((item) => item.event.operationId)).toEqual([
      "operation-second",
    ])
  })

  it("recovers a queued table action after process death", () => {
    const storage = new MemoryStorage()
    const tableAction: PendingLifeAction = {
      schemaVersion: 1,
      event: {
        type: "table.action",
        operationId: asOperationId("operation-table-01"),
        gameId: asGameId("game-public"),
        action: { kind: "designation.taken", playerId: "player-1", designationId: "monarch" },
        actorId: asActorId("user-1"),
        deviceId: asDeviceId("device-1"),
        clientCreatedAt: 1,
      },
      queuedAt: 1,
      attempts: 0,
    }
    queue(new ConnectedGameRepository(storage), tableAction)
    expect(stored(new ConnectedGameRepository(storage)).pending).toEqual([tableAction])
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
    queue(repository, laterClientTime)
    queue(repository, earlierClientTime)

    expect(stored(repository).pending.map((item) => item.event.operationId)).toEqual([
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
    expect(stored(new ConnectedGameRepository(storage)).pending).toEqual([orphan])

    storage.set(CONNECTED_KEYS.outboxIndex("game-public"), JSON.stringify(["operation-missing"]))
    expect(
      stored(new ConnectedGameRepository(storage)).pending.map((item) => item.event.operationId),
    ).toEqual(["operation-orphaned"])
    expect(JSON.parse(storage.getString(CONNECTED_KEYS.outboxIndex("game-public"))!)).toEqual([
      "operation-orphaned",
    ])
  })

  it("keeps a valid pending action when its competing failed record is corrupt", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    const pending = action("operation-corrupt-failure", 1, "user-a")
    queue(repository, pending)
    const failedKey = CONNECTED_KEYS.failedRecord(
      "game-public",
      pending.event.operationId,
      "user-a",
    )
    storage.set(failedKey, JSON.stringify({ schemaVersion: 2, action: pending }))

    expect(stored(repository).pending).toEqual([pending])
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
    expect(stored(repository).pending).toEqual([pending])
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
    expect(stored(repository).pending).toHaveLength(1)
    expect(storage.getString(CONNECTED_KEYS.legacyOutbox("game-public"))).toBeUndefined()
    expect(stored(repository).pending).toHaveLength(1)
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
    expect(stored(repository).pending).toEqual([])
    expect(stored(repository).failures).toEqual([])
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
    expect(stored(new ConnectedGameRepository(storage)).pending).toEqual([])
  })

  it("moves permanent failures out of pending but retains recovery details", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    queue(repository, action("operation-rejected"))
    await rejectQueued(repository, "Game is not active", 50)
    expect(stored(repository).pending).toEqual([])
    expect(stored(repository).failures[0]).toMatchObject({
      reason: "Game is not active",
      failedAt: 50,
    })
    repository.outbox("game-public").dismiss("operation-rejected")
    expect(stored(repository).failures).toEqual([])
  })

  it("keeps a rejected action pending when unresolved-failure storage is full", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxFailedRecords: 1,
      maxFailedBytes: 10_000,
    })
    const first = action("operation-failure-cap-01", 1, "user-1")
    const second = action("operation-failure-cap-02", 2, "user-1")
    queue(repository, first)
    await rejectQueued(repository, "Game is not active", 10)
    queue(repository, second)

    expect(await rejectQueued(repository, "Game is not active", 20)).toMatchObject({
      capacityBlocked: true,
    })
    expect(stored(repository).failures).toHaveLength(1)
    expect(stored(repository).pending).toMatchObject([
      { event: { operationId: second.event.operationId } },
    ])
  })

  it("compacts failure reasons to the versioned byte budget without dropping the failure", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxFailureReasonBytes: 16,
    })
    const rejected = action("operation-compact-reason", 1, "user-1")
    queue(repository, rejected)
    await rejectQueued(repository, "This server rejection reason is deliberately much too long", 10)
    const failure = stored(repository).failures[0]
    expect(failure.reason.endsWith("…")).toBe(true)
    expect(Buffer.byteLength(failure.reason, "utf8")).toBeLessThanOrEqual(16)
    expect(failure.action.event.operationId).toBe(rejected.event.operationId)
  })

  it("isolates prefix-related game IDs during orphan discovery", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    const longer = {
      ...action("operation-longer-game"),
      event: { ...action("operation-longer-game").event, gameId: asGameId("game.one") },
    }
    queue(repository, longer)
    expect(stored(repository, "game").pending).toEqual([])
    expect(stored(repository, "game.one").pending).toHaveLength(1)
  })

  it("isolates cached projection, pending, and failed state by Clerk subject", () => {
    const storage = new MemoryStorage()
    const accountA = new ConnectedGameRepository(storage, "user-a")
    const accountB = new ConnectedGameRepository(storage, "user-b")
    queue(accountA, action("operation-account-a", 1, "user-a"))
    queue(accountB, action("operation-account-b", 2, "user-b"))
    expect(stored(accountB).pending.map((item) => item.event.operationId)).toEqual([
      "operation-account-b",
    ])
    expect(stored(accountA).pending.map((item) => item.event.operationId)).toEqual([
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
    expect(stored(new ConnectedGameRepository(storage, "user-a")).failures).toEqual([])
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
    expect(stored(new ConnectedGameRepository(storage, "user-a")).failures).toEqual([])
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
    expect(stored(new ConnectedGameRepository(storage, "user-b")).pending).toEqual([])
    expect(storage.getString(CONNECTED_KEYS.legacyOutbox("game-public"))).toBeDefined()
    expect(
      stored(new ConnectedGameRepository(storage, "user-a")).pending.map(
        (item) => item.event.operationId,
      ),
    ).toEqual(["operation-legacy-a"])
    expect(storage.getString(CONNECTED_KEYS.legacyOutbox("game-public"))).toBeUndefined()
  })

  it("rejects unknown confirmed-projection schema versions", () => {
    const storage = new MemoryStorage()
    const validProjection = projection(0, 20)
    storage.set(
      CONNECTED_KEYS.projection("game-public"),
      JSON.stringify({ ...validProjection, schemaVersion: 2 }),
    )
    expect(new ConnectedGameRepository(storage).loadProjection("game-public")).toBeNull()
    storage.set(CONNECTED_KEYS.projection("game-public"), JSON.stringify(validProjection))
    expect(new ConnectedGameRepository(storage).loadProjection("game-public")).toEqual({
      ...validProjection,
      deckRequired: false,
      system: "mtg",
      format: "standard",
    })
  })

  it("repairs a projection whose payload belongs to a different scoped game", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    const wrongGameProjection = { ...projection(0, 20), publicId: "game-other" }
    const scopedKey = CONNECTED_KEYS.projection("game-public", "user-a")
    storage.set(scopedKey, JSON.stringify(wrongGameProjection))

    expect(repository.loadProjection("game-public")).toBeNull()
    expect(storage.getString(scopedKey)).toBeUndefined()
  })

  it("cleans a terminal game only after pending and failed actions are resolved", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    const terminal: ConnectedProjection = { ...projection(1, 25), status: "finished" }
    const pending = action("operation-terminal-pending", 1, "user-a")
    repository.saveProjection(terminal)
    queue(repository, pending)

    expect(repository.cleanupTerminalGame(terminal, repository.outbox("game-public"))).toBe(false)
    expect(repository.loadProjection("game-public")).not.toBeNull()

    repository.outbox("game-public").acknowledge([pending.event.operationId])
    const rejected = action("operation-terminal-failed", 2, "user-a")
    queue(repository, rejected)
    await rejectQueued(repository, "Game is not active", 3)
    expect(repository.cleanupTerminalGame(terminal, repository.outbox("game-public"))).toBe(false)
    expect(repository.loadProjection("game-public")).not.toBeNull()

    const outbox = repository.outbox("game-public")
    outbox.dismiss(rejected.event.operationId)
    expect(repository.cleanupTerminalGame(terminal, outbox)).toBe(true)
    expect(repository.loadProjection("game-public")).toBeNull()
    expect([...storage.values.keys()].filter((key) => key.startsWith("count.connected."))).toEqual(
      [],
    )
  })

  it("sends every queued action kind without the stored writer provenance", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const life = action("operation-life-0001", 1)
    const { actorId, deviceId, gameId } = life.event
    const claim: PendingLifeAction = {
      ...action("operation-claim-0001", 2),
      event: {
        type: "commanderDamage.submitted",
        operationId: asOperationId("operation-claim-0001"),
        gameId,
        fromPlayerId: asPlayerId("player-1"),
        toPlayerId: asPlayerId("player-2"),
        commander: PARTNER_COMMANDER,
        delta: 3,
        actorId,
        deviceId,
        clientCreatedAt: 2,
      },
    }
    const resolution: PendingLifeAction = {
      ...action("operation-resolve-0001", 3),
      event: {
        type: "commanderDamage.resolved",
        operationId: asOperationId("operation-resolve-0001"),
        claimOperationId: asOperationId("operation-claim-0001"),
        gameId,
        toPlayerId: asPlayerId("player-2"),
        accepted: true,
        actorId,
        deviceId,
        clientCreatedAt: 3,
      },
    }
    setOutboxWriter({ app: "1.4.0", update: "update-a", runtime: "runtime-1" })
    for (const queued of [life, claim, resolution]) queue(repository, queued)
    setOutboxWriter(undefined)
    expect(
      [...storage.values.values()].filter((value) => value.includes('"writtenBy"')),
    ).toHaveLength(3)

    const acknowledge = async (args: { operationId: string }) => ({
      operationId: args.operationId,
    })
    const mutations = {
      changeLife: jest.fn(acknowledge),
      tableAction: jest.fn(acknowledge),
      submitCommanderDamage: jest.fn(acknowledge),
      confirmCommanderDamage: jest.fn(acknowledge),
      declineCommanderDamage: jest.fn(acknowledge),
    }
    for (const queued of stored(repository).pending)
      await sendQueuedAction(mutations, "game-public", queued)

    const sent = Object.values(mutations).flatMap((mutation) => mutation.mock.calls)
    expect(sent).toHaveLength(3)
    for (const [args] of sent) expect(args).not.toHaveProperty("writtenBy")
    expect(mutations.submitCommanderDamage).toHaveBeenCalledWith(
      expect.objectContaining({ commander: PARTNER_COMMANDER, delta: 3 }),
    )
  })
})

describe("stored life changes", () => {
  it("reads and sends pending and failed life changes as v0.1.1 stored them", async () => {
    const storage = new MemoryStorage()
    const pendingId = "operation_0f4c2b7e9a1d4c6b8e2f3a5d7c9b1e0f"
    const failedId = "operation_7d1e3c5a9b2f4e6d8c0a1b3e5f7d9c2a"
    const event = (operationId: string, delta: number, at: number) => ({
      type: "life.changed",
      operationId,
      gameId: "game-public",
      playerId: "player-1",
      delta,
      actorId: "user-1",
      deviceId: "device-1",
      clientCreatedAt: at,
    })
    storage.set(
      CONNECTED_KEYS.outboxRecord("game-public", pendingId, "user-1"),
      JSON.stringify({
        schemaVersion: 1,
        event: event(pendingId, -3, 10),
        queuedAt: 10,
        attempts: 0,
      }),
    )
    storage.set(CONNECTED_KEYS.outboxIndex("game-public", "user-1"), JSON.stringify([pendingId]))
    storage.set(
      CONNECTED_KEYS.failedRecord("game-public", failedId, "user-1"),
      JSON.stringify({
        schemaVersion: 1,
        action: {
          schemaVersion: 1,
          event: event(failedId, 2, 5),
          queuedAt: 5,
          attempts: 1,
          lastAttemptAt: 6,
        },
        reason: "Game is not active",
        failedAt: 7,
      }),
    )
    storage.set(CONNECTED_KEYS.failedIndex("game-public", "user-1"), JSON.stringify([failedId]))
    const repository = new ConnectedGameRepository(storage, "user-1")

    const pending = stored(repository).pending
    expect(stored(repository).failures.map(({ action }) => action.event.operationId)).toEqual([
      failedId,
    ])
    expect([...storage.values.keys()].filter((key) => key.startsWith("quarantine:"))).toEqual([])
    const changeLife = jest.fn(async (args: { operationId: string }) => ({
      operationId: args.operationId,
    }))
    const unused = jest.fn()
    await sendQueuedAction(
      {
        changeLife,
        tableAction: unused,
        submitCommanderDamage: unused,
        confirmCommanderDamage: unused,
        declineCommanderDamage: unused,
      },
      "game-public",
      pending[0],
    )
    expect(changeLife).toHaveBeenCalledWith({
      publicId: "game-public",
      playerId: "player-1",
      operationId: pendingId,
      delta: -3,
      deviceId: "device-1",
      clientCreatedAt: 10,
    })
  })
})

function resumeEntry(publicId: string, updatedAt: number, isHost = true): ResumableGame {
  return {
    publicId,
    status: "active",
    isHost,
    playerCount: 2,
    ruleset: "standard",
    updatedAt,
    startingLife: 20,
  }
}

function restarted(repository: ConnectedGameRepository, storage: MemoryStorage) {
  return new ConnectedGameRepository(
    storage,
    (repository as unknown as { ownerId: string }).ownerId,
    {},
    (repository as unknown as { deployment: string }).deployment,
  )
}

describe("connected resume index", () => {
  it("keeps a game in a system this app doesn't know off Magic after a restart", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const projection = toConnectedProjection({
      schemaVersion: 1,
      publicId: "game-public",
      status: "active",
      playerCount: 2,
      system: "a-later-system",
      startingLife: 20,
      ruleset: "standard",
      isHost: true,
      eventSequence: 0,
      serverUpdatedAt: 10,
      recentOperationIds: [],
      players: [],
    })!
    repository.saveProjection(projection)
    repository.createResumeObserver()(projection)

    const reloaded = restarted(repository, storage)
    expect(reloaded.loadProjection("game-public")?.system).toBeUndefined()
    expect(storedPlaySystem(reloaded.loadResumeIndex()[0].system)).toBeUndefined()
  })

  it("stores sanitized rows even when the server page carries extra fields", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    const key = CONNECTED_KEYS.resumeIndex("user-1", deployment)
    new ConnectedGameRepository(storage, "user-1", {}, deployment).syncResumeIndex(
      [
        { ...resumeEntry("game-public", 7), deckVersionId: "deck-1", invitation: { token: "t" } },
      ] as never,
      true,
    )
    const stored = JSON.parse(storage.getString(key) ?? "{}")
    expect(stored.games).toHaveLength(1)
    expect(Object.keys(stored.games[0]).sort()).toEqual([
      "isHost",
      "playerCount",
      "publicId",
      "ruleset",
      "startingLife",
      "status",
      "updatedAt",
    ])
  })

  it("keeps hosted games inside the bound before joined ones are evicted", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(
      storage,
      "user-1",
      {},
      "small-ibis-123.convex.cloud",
    )
    const joined = Array.from({ length: RESUME_INDEX_LIMIT }, (_, index) =>
      resumeEntry(`game-joined-${index}`, RESUME_INDEX_LIMIT - index, false),
    )
    repository.syncResumeIndex(joined, true)
    repository.syncResumeIndex([resumeEntry("game-hosted", 0)], false)
    const loaded = restarted(repository, storage).loadResumeIndex()
    expect(loaded).toHaveLength(RESUME_INDEX_LIMIT)
    expect(loaded[0]).toMatchObject({ publicId: "game-hosted", isHost: true })
    expect(loaded.map((game) => game.publicId)).not.toContain("game-joined-29")
  })

  it("tracks projection recency without undoing removal or touching saved actions", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const observe = repository.createResumeObserver()
    const projection: ConnectedProjection = {
      schemaVersion: 1,
      publicId: "game-public",
      status: "active",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      isHost: true,
      eventSequence: 0,
      serverUpdatedAt: 10,
      recentOperationIds: [],
      players: [],
    }
    repository.syncResumeIndex([resumeEntry("game-other", 5)], true)
    repository.saveProjection(projection)
    queue(repository, action("operation-resume-001"))
    const writes = jest.spyOn(storage, "set")

    observe(projection)
    expect(repository.loadResumeIndex().map((game) => game.publicId)).toEqual([
      "game-public",
      "game-other",
    ])
    writes.mockClear()
    observe(projection)
    expect(writes).not.toHaveBeenCalled()
    observe({ ...projection, serverUpdatedAt: 11 })
    expect(repository.loadResumeIndex()[0].updatedAt).toBe(11)

    repository.removeResumeEntry(projection.publicId)
    observe({ ...projection, serverUpdatedAt: 11 })
    expect(repository.loadResumeIndex().map((game) => game.publicId)).toEqual(["game-other"])

    const observeAfterRemount = repository.createResumeObserver()
    observeAfterRemount({ ...projection, serverUpdatedAt: 11 })
    expect(repository.loadResumeIndex()[0].publicId).toBe("game-public")
    observeAfterRemount({ ...projection, status: "finished", serverUpdatedAt: 12 })
    expect(repository.loadResumeIndex().map((game) => game.publicId)).toEqual(["game-other"])
    expect(repository.loadProjection(projection.publicId)?.status).toBe("active")
    expect(stored(repository, projection.publicId).pending).toHaveLength(1)
  })

  it("merges partial pages with cached entries and replaces only on an exhausted page set", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    const repository = new ConnectedGameRepository(storage, "user-1", {}, deployment)
    repository.syncResumeIndex([resumeEntry("game-older", 1)], true)
    repository.syncResumeIndex([resumeEntry("game-new", 5)], false)
    expect(
      restarted(repository, storage)
        .loadResumeIndex()
        .map((game) => game.publicId),
    ).toEqual(["game-new", "game-older"])
    repository.syncResumeIndex([], false)
    expect(
      restarted(repository, storage)
        .loadResumeIndex()
        .map((game) => game.publicId),
    ).toEqual(["game-new", "game-older"])
    repository.syncResumeIndex([resumeEntry("game-new", 6)], true)
    expect(
      restarted(repository, storage)
        .loadResumeIndex()
        .map((game) => game.publicId),
    ).toEqual(["game-new"])
  })

  it("drops invalid entries when reading and caps the index", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    const repository = new ConnectedGameRepository(storage, "user-1", {}, deployment)
    const games = Array.from({ length: RESUME_INDEX_LIMIT + 1 }, (_, index) =>
      resumeEntry(`game-${index}`, index),
    )
    repository.syncResumeIndex(games, true)
    const key = CONNECTED_KEYS.resumeIndex("user-1", deployment)
    const stored = JSON.parse(storage.getString(key) ?? "{}")
    stored.games.push({ publicId: "game-broken", status: "finished" })
    storage.set(key, JSON.stringify(stored))
    const loaded = new ConnectedGameRepository(storage, "user-1", {}, deployment).loadResumeIndex()
    expect(loaded).toHaveLength(RESUME_INDEX_LIMIT)
    expect(loaded.map((game) => game.publicId)).not.toContain("game-broken")
  })

  it("scopes rows by deployment and account", () => {
    const storage = new MemoryStorage()
    new ConnectedGameRepository(storage, "user-1", {}, "other.convex.cloud").syncResumeIndex(
      [resumeEntry("game-other-deployment", 1)],
      true,
    )
    new ConnectedGameRepository(
      storage,
      "user-2",
      {},
      "small-ibis-123.convex.cloud",
    ).syncResumeIndex([resumeEntry("game-other-account", 1)], true)
    const repository = new ConnectedGameRepository(
      storage,
      "user-1",
      {},
      "small-ibis-123.convex.cloud",
    )
    expect(repository.loadResumeIndex()).toEqual([])
  })

  it("finds the newest resume for one account only, per deployment", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    new ConnectedGameRepository(storage, "user-1", {}, deployment).syncResumeIndex(
      [resumeEntry("game-older", 1), resumeEntry("game-newer", 5)],
      true,
    )
    new ConnectedGameRepository(storage, "user-2", {}, deployment).syncResumeIndex(
      [resumeEntry("game-other-account", 9)],
      true,
    )
    new ConnectedGameRepository(storage, "user-1", {}, "other.convex.cloud").syncResumeIndex(
      [resumeEntry("game-other-deployment", 50)],
      true,
    )
    expect(loadNewestResumeGame("user-1", storage, deployment)?.publicId).toBe("game-newer")
    expect(loadNewestResumeGame("user-1", storage, "other.convex.cloud")?.publicId).toBe(
      "game-other-deployment",
    )
    expect(loadNewestResumeGame("user-3", storage, deployment)).toBeNull()
  })

  it("reports whether any account has a resumable game before the account is known", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    expect(hasAnyResumeGame(storage, deployment)).toBe(false)
    storage.set(
      `count.connected.resume.v1.${deployment}.evil.6:user-3`,
      JSON.stringify({ schemaVersion: 1, games: [resumeEntry("game-evil", 99)] }),
    )
    expect(hasAnyResumeGame(storage, deployment)).toBe(false)
    new ConnectedGameRepository(storage, "user-2", {}, deployment).syncResumeIndex(
      [resumeEntry("game-saved", 1)],
      true,
    )
    expect(hasAnyResumeGame(storage, deployment)).toBe(true)
    expect(hasAnyResumeGame(storage, "other.convex.cloud")).toBe(false)
  })

  it("removes a single entry without touching the rest and ignores anonymous writes", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    const repository = new ConnectedGameRepository(storage, "user-1", {}, deployment)
    repository.syncResumeIndex([resumeEntry("game-a", 1), resumeEntry("game-b", 2)], true)
    repository.removeResumeEntry("game-a")
    expect(
      restarted(repository, storage)
        .loadResumeIndex()
        .map(({ publicId }) => publicId),
    ).toEqual(["game-b"])
    const anonymous = new ConnectedGameRepository(storage, "anonymous", {}, deployment)
    anonymous.syncResumeIndex([resumeEntry("game-anon", 1)], true)
    anonymous.removeResumeEntry("game-b")
    expect(anonymous.loadResumeIndex()).toEqual([])
    expect(
      new ConnectedGameRepository(storage, "user-1", {}, deployment).loadResumeIndex(),
    ).toHaveLength(1)
  })

  it("sweeps one game from every cached resume index without touching other deployments", () => {
    const storage = new MemoryStorage()
    const deployment = "small-ibis-123.convex.cloud"
    new ConnectedGameRepository(storage, "user-1", {}, deployment).syncResumeIndex(
      [resumeEntry("game-gone", 10), resumeEntry("game-kept", 5)],
      true,
    )
    new ConnectedGameRepository(storage, "user-2", {}, deployment).syncResumeIndex(
      [resumeEntry("game-gone", 7)],
      true,
    )
    new ConnectedGameRepository(storage, "user-1", {}, "other.convex.cloud").syncResumeIndex(
      [resumeEntry("game-gone", 9)],
      true,
    )
    const listener = jest.fn()
    const unsubscribe = subscribeResumeIndex(listener)
    try {
      removeResumeEntryEverywhere("game-gone", storage, deployment)
      expect(loadNewestResumeGame("user-1", storage, deployment)?.publicId).toBe("game-kept")
      expect(loadNewestResumeGame("user-2", storage, deployment)).toBeNull()
      expect(loadNewestResumeGame("user-1", storage, "other.convex.cloud")?.publicId).toBe(
        "game-gone",
      )
      expect(listener).toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})
