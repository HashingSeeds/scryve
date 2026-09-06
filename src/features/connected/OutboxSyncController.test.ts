import type { ConnectedProjection, PendingLifeAction } from "./model"
import { OutboxSyncController, type OutboxSyncEnvironment } from "./OutboxSyncController"
import { ConnectedGameRepository } from "./persistence"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

jest.mock("@/utils/telemetry", () => ({ emitTelemetry: jest.fn() }))

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

class ManualClock {
  time = 0
  scheduledDelays: number[] = []
  private nextHandle = 1
  private readonly timers = new Map<number, { at: number; handler: () => void }>()

  now = () => this.time

  setTimeoutFn = (handler: () => void, delay: number) => {
    const handle = this.nextHandle++
    this.scheduledDelays.push(delay)
    this.timers.set(handle, { at: this.time + delay, handler })
    return handle as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeoutFn = (handle: ReturnType<typeof setTimeout>) => {
    this.timers.delete(handle as unknown as number)
  }

  get activeCount() {
    return this.timers.size
  }

  advance(milliseconds: number) {
    this.time += milliseconds
    for (const [handle, timer] of [...this.timers]) {
      if (timer.at > this.time) continue
      this.timers.delete(handle)
      timer.handler()
    }
  }
}

const ONLINE: OutboxSyncEnvironment = {
  isAuthenticated: true,
  isLoading: false,
  isRefreshing: false,
  isWebSocketConnected: true,
  remoteReady: true,
}

function action(operationId: string, delta: -5 | -1 | 1 | 5, queuedAt: number): PendingLifeAction {
  return {
    schemaVersion: 1,
    event: {
      type: "life.changed",
      operationId: asOperationId(operationId),
      gameId: asGameId("game-public"),
      playerId: asPlayerId("player-1"),
      delta,
      actorId: asActorId("user-1"),
      deviceId: asDeviceId("device-1"),
      clientCreatedAt: queuedAt,
    },
    queuedAt,
    attempts: 0,
  }
}

function projection(eventSequence: number, currentLife: number): ConnectedProjection {
  return {
    schemaVersion: 1,
    publicId: "game-public",
    status: "active",
    playerCount: 2,
    startingLife: 20,
    ruleset: "standard",
    isHost: true,
    eventSequence,
    serverUpdatedAt: eventSequence + 1,
    recentOperationIds: [],
    players: [
      {
        playerId: "player-1",
        seat: 1,
        displayName: "Ada",
        color: "#111111",
        currentLife,
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
}

async function settle() {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve()
}

function harness(
  options: {
    repository?: ConnectedGameRepository
    storage?: MemoryStorage
    send?: (queued: PendingLifeAction) => Promise<{ operationId: string }>
    awaitProjectionBarrier?: boolean
    projectionBarrierTimeoutMs?: number
    finishGame?: () => Promise<unknown>
    abandonGame?: () => Promise<unknown>
  } = {},
) {
  const storage = options.storage ?? new MemoryStorage()
  const repository = options.repository ?? new ConnectedGameRepository(storage, "user-1")
  const clock = new ManualClock()
  const sent: string[] = []
  const controller = new OutboxSyncController({
    repository,
    publicId: "game-public",
    ownerId: "user-1",
    deviceId: asDeviceId("device-1"),
    send:
      options.send ??
      (async (queued) => {
        sent.push(queued.event.operationId)
        return { operationId: queued.event.operationId }
      }),
    finishGame: options.finishGame ?? (async () => undefined),
    abandonGame: options.abandonGame ?? (async () => undefined),
    awaitProjectionBarrier: options.awaitProjectionBarrier,
    projectionBarrierTimeoutMs: options.projectionBarrierTimeoutMs,
    now: clock.now,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  })
  return { clock, controller, repository, sent, storage }
}

describe("outbox sync controller", () => {
  it("drains a queued life change and acknowledges it", async () => {
    const { controller, repository, sent } = harness()
    controller.setEnvironment(ONLINE)

    controller.changeLife("player-1", 5)
    expect(controller.getSnapshot().pending).toHaveLength(1)
    await settle()

    expect(sent).toHaveLength(1)
    expect(controller.getSnapshot().pending).toEqual([])
    expect(controller.getSnapshot().connectionStatus).toBe("connected")
    expect(repository.loadOutbox("game-public")).toEqual([])
  })

  it.each(["projection-first", "acknowledgement-first"] as const)(
    "applies one life delta and persists its confirmation: %s",
    async (ordering) => {
      const storage = new MemoryStorage()
      const repository = new ConnectedGameRepository(storage, "user-1")
      const queued = action("operation-atomic-projection", 5, 1)
      repository.enqueue(queued, [])
      let acknowledge!: (value: { operationId: string }) => void
      const sent = new Promise<{ operationId: string }>((resolve) => {
        acknowledge = resolve
      })
      const { controller } = harness({
        storage,
        repository,
        awaitProjectionBarrier: true,
        send: () => sent,
      })
      controller.onRemoteProjection(projection(0, 20))
      controller.setEnvironment(ONLINE)
      await settle()
      if (ordering === "acknowledgement-first") {
        acknowledge({ operationId: queued.event.operationId })
        await settle()
      }
      expect(controller.getSnapshot().projection?.players[0].currentLife).toBe(25)
      controller.onRemoteProjection(projection(1, 25), {
        status: "acknowledged",
        operationId: queued.event.operationId,
        projectionEventSequence: 1,
      })
      expect(controller.getSnapshot().projection?.players[0].currentLife).toBe(25)
      expect(harness({ storage }).controller.getSnapshot().projection?.players[0].currentLife).toBe(
        25,
      )
      acknowledge({ operationId: queued.event.operationId })
      await settle()
      expect(controller.getSnapshot().pending).toEqual([])
      expect(controller.getSnapshot().projection?.players[0].currentLife).toBe(25)
    },
  )

  it("waits for the modern projection barrier after a mutation succeeds", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const queued = action("operation-barrier-0001", 5, 1)
    repository.enqueue(queued, [])
    const { controller, sent } = harness({
      storage,
      repository,
      awaitProjectionBarrier: true,
    })

    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment(ONLINE)
    await settle()
    expect(sent).toEqual([queued.event.operationId])
    expect(controller.getSnapshot().pending).toHaveLength(1)

    controller.onOperationStatus({
      status: "acknowledged",
      operationId: queued.event.operationId,
      projectionEventSequence: 1,
    })
    controller.onRemoteProjection(projection(1, 25))
    await settle()
    expect(controller.getSnapshot().pending).toEqual([])
  })

  it("keeps an acknowledged change across restart until the projection catches up", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const queued = action("operation-restart-barrier", 5, 1)
    repository.saveProjection(projection(0, 20))
    repository.enqueue(queued, [])
    const first = harness({ storage, repository, awaitProjectionBarrier: true })

    first.controller.onRemoteProjection(projection(0, 20))
    first.controller.setEnvironment(ONLINE)
    await settle()
    first.controller.onOperationStatus({
      status: "acknowledged",
      operationId: queued.event.operationId,
      projectionEventSequence: 1,
    })
    await settle()

    expect(first.repository.loadOutbox("game-public")).toHaveLength(1)
    const restarted = harness({ storage, awaitProjectionBarrier: true })
    expect(restarted.controller.getSnapshot()).toMatchObject({
      pending: [{ event: { operationId: queued.event.operationId } }],
      projection: { players: [{ currentLife: 25 }, { currentLife: 20 }] },
    })

    restarted.controller.onRemoteProjection(projection(0, 20))
    restarted.controller.setEnvironment(ONLINE)
    await settle()
    restarted.controller.onOperationStatus({
      status: "acknowledged",
      operationId: queued.event.operationId,
      projectionEventSequence: 1,
    })
    restarted.controller.onRemoteProjection(projection(1, 25))
    await settle()

    expect(restarted.repository.loadOutbox("game-public")).toEqual([])
    const restored = harness({ storage, awaitProjectionBarrier: true })
    expect(restored.controller.getSnapshot()).toMatchObject({
      pending: [],
      projection: { players: [{ currentLife: 25 }, { currentLife: 20 }] },
    })
  })

  it("retains a conflicting status as a loud durable failure", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const queued = action("operation-barrier-0002", 5, 1)
    repository.enqueue(queued, [])
    const { controller } = harness({
      storage,
      repository,
      awaitProjectionBarrier: true,
    })

    controller.onRemoteProjection(projection(0, 20))
    controller.onOperationStatus({
      status: "conflict",
      operationId: queued.event.operationId,
      reason: "Operation identifier was reused with different data",
    })
    controller.setEnvironment(ONLINE)
    await settle()

    expect(controller.getSnapshot().pending).toEqual([])
    expect(controller.getSnapshot().failed).toMatchObject([
      { action: { event: { operationId: queued.event.operationId } } },
    ])
  })

  it("retries when the projection barrier times out", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    repository.enqueue(action("operation-barrier-timeout", 5, 1), [])
    const { clock, controller, sent } = harness({
      storage,
      repository,
      awaitProjectionBarrier: true,
      projectionBarrierTimeoutMs: 100,
    })

    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment(ONLINE)
    await settle()
    expect(sent).toHaveLength(1)
    expect(controller.getSnapshot().pending).toHaveLength(1)

    clock.advance(100)
    await settle()
    expect(controller.getSnapshot().pending).toHaveLength(1)
    expect(controller.getSnapshot().connectionStatus).toBe("offline")

    clock.advance(500)
    await settle()
    expect(sent).toHaveLength(2)
  })

  it("queues a defender confirmation made while offline and replays it on reconnect", async () => {
    const { clock, controller, repository, sent } = harness()
    const claim = {
      claimId: "claim-1",
      operationId: "commander-claim-000001",
      fromPlayerId: "player-2",
      toPlayerId: "player-1",
      delta: 4,
      clientCreatedAt: clock.now(),
      createdAt: clock.now(),
    }
    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })

    controller.resolveCommanderDamage(claim, true)
    expect(controller.getSnapshot().pending).toHaveLength(1)
    expect(controller.getSnapshot().changeError).toBeUndefined()
    expect(repository.loadOutbox("game-public")).toHaveLength(1)

    controller.setEnvironment(ONLINE)
    await settle()

    expect(sent).toHaveLength(1)
    expect(controller.getSnapshot().pending).toEqual([])
    expect(repository.loadOutbox("game-public")).toEqual([])
  })

  it("queues nothing when any staged commander damage sits outside the supported range", () => {
    const { controller, repository } = harness()
    controller.setEnvironment(ONLINE)

    controller.submitCommanderDamage("player-1", [
      { toPlayerId: "player-2", delta: 4 },
      { toPlayerId: "player-3", delta: 120 },
    ])

    expect(controller.getSnapshot().pending).toEqual([])
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(controller.getSnapshot().changeError).toMatch(/between 1 and 99/i)
  })

  it("rejects commander damage against the attacking player before enqueueing", () => {
    const { controller, repository } = harness()
    controller.submitCommanderDamage("player-1", [{ toPlayerId: "player-1", delta: 4 }])
    expect(controller.getSnapshot().pending).toEqual([])
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(controller.getSnapshot().changeError).toBe("A commander cannot damage itself")
  })

  it("keeps a declined claim distinct from a confirmed one", () => {
    const { clock, controller } = harness()
    const claim = {
      claimId: "claim-1",
      operationId: "commander-claim-000001",
      fromPlayerId: "player-2",
      toPlayerId: "player-1",
      delta: 4,
      clientCreatedAt: clock.now(),
      createdAt: clock.now(),
    }
    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })

    controller.resolveCommanderDamage(claim, false)

    const [queued] = controller.getSnapshot().pending
    expect(queued.event).toMatchObject({
      type: "commanderDamage.resolved",
      claimOperationId: claim.operationId,
      toPlayerId: claim.toPlayerId,
      accepted: false,
    })
  })

  it("schedules a backoff retry after a transient send failure", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    repository.enqueue(action("operation-transient-01", 1, 1), [])
    const attempts: string[] = []
    const { clock, controller } = harness({
      storage,
      repository,
      send: async (queued) => {
        attempts.push(queued.event.operationId)
        if (attempts.length === 1) throw new Error("Network request failed")
        return { operationId: queued.event.operationId }
      },
    })

    controller.setEnvironment(ONLINE)
    await settle()
    expect(attempts).toHaveLength(1)
    expect(controller.getSnapshot().connectionStatus).toBe("offline")
    expect(clock.scheduledDelays).toEqual([500])

    clock.advance(500)
    await settle()
    expect(attempts).toHaveLength(2)
    expect(controller.getSnapshot().pending).toEqual([])
  })

  it("retains a permanently rejected action as a reviewable failure", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    repository.enqueue(action("operation-rejected-01", 5, 1), [])
    const { controller } = harness({
      storage,
      repository,
      send: async () => {
        throw new Error("Game is not active")
      },
    })

    controller.setEnvironment(ONLINE)
    await settle()

    expect(controller.getSnapshot().pending).toEqual([])
    expect(controller.getSnapshot().failed).toMatchObject([{ reason: "Game is not active" }])
  })

  it("resumes draining once a reviewed failure is dismissed", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1", {
      maxFailedRecords: 1,
      maxFailedBytes: 10_000,
    })
    const prior = action("operation-prior-failed", 1, 1)
    const blocked = action("operation-blocked-fail", 5, 2)
    repository.enqueue(prior, [])
    repository.fail("game-public", prior.event.operationId, "Game is not active", 10)
    repository.enqueue(blocked, [])
    const { controller } = harness({
      storage,
      repository,
      send: async () => {
        throw new Error("Game is not active")
      },
    })

    controller.setEnvironment(ONLINE)
    await settle()
    expect(controller.getSnapshot().changeError).toMatch(/need review/i)
    expect(controller.getSnapshot().pending).toHaveLength(1)

    controller.dismissFailed(prior.event.operationId)
    expect(controller.getSnapshot().changeError).toBeUndefined()
    await settle()

    expect(controller.getSnapshot().pending).toEqual([])
    expect(
      controller.getSnapshot().failed.map((failure) => failure.action.event.operationId),
    ).toEqual([blocked.event.operationId])
  })

  it("reruns a drain after authentication refresh invalidates the active drain", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    const first = action("operation-flap-first-1", 1, 1)
    const second = action("operation-flap-second", 5, 2)
    repository.enqueue(first, [])
    repository.enqueue(second, [first])
    let releaseFirst!: (value: { operationId: string }) => void
    const deferred = new Promise<{ operationId: string }>((resolve) => {
      releaseFirst = resolve
    })
    const sent: string[] = []
    const { controller } = harness({
      storage,
      repository,
      send: async (queued) => {
        sent.push(queued.event.operationId)
        return sent.length === 1 ? deferred : { operationId: queued.event.operationId }
      },
    })

    controller.setEnvironment(ONLINE)
    await settle()
    expect(sent).toEqual([first.event.operationId])

    controller.setEnvironment({ ...ONLINE, isLoading: true })
    controller.setEnvironment(ONLINE)
    releaseFirst({ operationId: first.event.operationId })
    await settle()
    expect(sent).toEqual([first.event.operationId, second.event.operationId])
    expect(repository.loadOutbox("game-public")).toEqual([])
  })

  it("returns an identical snapshot until state actually changes", () => {
    const { controller } = harness()
    const initial = controller.getSnapshot()

    expect(controller.getSnapshot()).toBe(initial)
    expect(controller.getSnapshot()).toBe(initial)

    controller.setEnvironment(ONLINE)
    const online = controller.getSnapshot()
    expect(online).not.toBe(initial)
    expect(controller.getSnapshot()).toBe(online)
  })

  it("does not drain while Convex is refreshing authentication", async () => {
    const { controller } = harness()
    controller.getSnapshot()
    controller.setEnvironment({ ...ONLINE, isRefreshing: true })
    controller.changeLife("player-1", 1)
    await settle()

    expect(controller.getSnapshot().pending).toHaveLength(1)
  })

  it("notifies subscribers and stops after they unsubscribe", () => {
    const { controller } = harness()
    const listener = jest.fn()
    const unsubscribe = controller.subscribe(listener)

    controller.setEnvironment(ONLINE)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    controller.changeLife("player-1", 1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("cancels a pending retry timer when disposed", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    repository.enqueue(action("operation-disposed-01", 1, 1), [])
    const attempts: string[] = []
    const { clock, controller } = harness({
      storage,
      repository,
      send: async (queued) => {
        attempts.push(queued.event.operationId)
        throw new Error("Network request failed")
      },
    })

    controller.setEnvironment(ONLINE)
    await settle()
    expect(clock.activeCount).toBe(1)

    controller.dispose()
    expect(clock.activeCount).toBe(0)

    clock.advance(10_000)
    await settle()
    expect(attempts).toHaveLength(1)
  })
})
