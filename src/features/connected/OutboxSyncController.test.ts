import type { PendingLifeAction } from "./model"
import { OutboxSyncController, type OutboxSyncEnvironment } from "./OutboxSyncController"
import { ConnectedGameRepository } from "./persistence"
import { projection } from "../../../test/fixtures/connectedProjection"
import { MemoryStorage } from "../../../test/support/memoryStorage"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

jest.mock("@/utils/telemetry", () => ({ emitTelemetry: jest.fn() }))

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

async function settle() {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve()
}

function harness(
  options: {
    repository?: ConnectedGameRepository
    storage?: MemoryStorage
    send?: (queued: PendingLifeAction) => Promise<{ operationId: string; status?: string }>
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

  it("keeps syncing, not offline, and retries when the projection barrier times out", async () => {
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
    expect(controller.getSnapshot().connectionStatus).toBe("syncing")

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

  it("queues only the Life Points a Yu-Gi-Oh! seat has left, and nothing once it is at 0", () => {
    const { controller } = harness()
    controller.onRemoteProjection({ ...projection(0, 8000), system: "ygo" })

    controller.changeLife("player-1", -8500)
    controller.changeLife("player-1", -100)

    const snapshot = controller.getSnapshot()
    expect(
      snapshot.pending.map(({ event }) => event.type === "life.changed" && event.delta),
    ).toEqual([-8000])
    expect(snapshot.projection?.players[0].currentLife).toBe(0)
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

  it("queues each partner's damage with its own commander slot", () => {
    const { controller, repository } = harness()
    controller.submitCommanderDamage("player-1", [
      { toPlayerId: "player-2", delta: 4 },
      { toPlayerId: "player-2", commander: 1, delta: 2 },
    ])
    const queued = repository
      .loadOutbox("game-public")
      .flatMap(({ event }) => (event.type === "commanderDamage.submitted" ? [event] : []))
    expect(queued.find((event) => event.delta === 4)).not.toHaveProperty("commander")
    expect(queued.find((event) => event.delta === 2)).toMatchObject({ commander: 1 })
  })

  it("rejects commander damage against the attacking player before enqueueing", () => {
    const { controller, repository } = harness()
    controller.submitCommanderDamage("player-1", [{ toPlayerId: "player-1", delta: 4 }])
    expect(controller.getSnapshot().pending).toEqual([])
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(controller.getSnapshot().changeError).toBe("A commander cannot damage itself")
  })

  it("folds 300 offline taps on one seat into one queued change and sends it once", async () => {
    const sentDeltas: number[] = []
    const { controller, repository } = harness({
      send: async ({ event }) => {
        if (event.type === "life.changed") sentDeltas.push(event.delta)
        return { operationId: event.operationId }
      },
    })
    controller.onRemoteProjection(projection(0, 400))
    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })

    for (let tap = 0; tap < 300; tap += 1) controller.changeLife("player-1", -1)

    expect(controller.getSnapshot().changeError).toBeUndefined()
    expect(repository.loadOutbox("game-public")).toHaveLength(1)
    expect(controller.getSnapshot().projection?.players[0].currentLife).toBe(100)
    controller.setEnvironment(ONLINE)
    await settle()
    expect(sentDeltas).toEqual([-300])
    expect(controller.getSnapshot().pending).toEqual([])
  })

  it("starts a new queued change on a direction flip, another seat, or another action between taps", () => {
    const { clock, controller } = harness()
    controller.onRemoteProjection(projection(0, 20))
    const steps = [
      () => controller.changeLife("player-1", 1),
      () => controller.changeLife("player-1", 1),
      () => controller.changeLife("player-1", -1),
      () => controller.changeLife("player-2", 1),
      () => controller.submitCommanderDamage("player-1", [{ toPlayerId: "player-2", delta: 2 }]),
      () => controller.changeLife("player-2", 1),
    ]

    for (const step of steps) {
      clock.time += 1
      step()
    }

    expect(
      controller
        .getSnapshot()
        .pending.map(({ event }) =>
          event.type === "life.changed" ? `${event.playerId} ${event.delta}` : event.type,
        ),
    ).toEqual([
      "player-1 2",
      "player-1 -1",
      "player-2 1",
      "commanderDamage.submitted",
      "player-2 1",
    ])
  })

  it("never adds a tap to a change a drain has already picked up", async () => {
    const sentDeltas: number[] = []
    const { controller } = harness({
      send: ({ event }) => {
        if (event.type === "life.changed") sentDeltas.push(event.delta)
        return new Promise(() => {})
      },
    })
    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment(ONLINE)

    controller.changeLife("player-1", 1)
    await settle()
    controller.changeLife("player-1", 1)
    controller.changeLife("player-1", 1)

    expect(sentDeltas).toEqual([1])
    expect(
      controller
        .getSnapshot()
        .pending.map(({ event }) => (event.type === "life.changed" ? event.delta : null)),
    ).toEqual([1, 2])
  })

  it("never adds a tap to a change queued before this session", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-1")
    repository.enqueue(action("operation-earlier-0001", 5, 1), [])
    const { controller } = harness({ storage, repository })
    controller.onRemoteProjection(projection(0, 20))

    controller.changeLife("player-1", 5)

    expect(
      repository
        .loadOutbox("game-public")
        .map(({ event }) => (event.type === "life.changed" ? event.delta : null)),
    ).toEqual([5, 5])
  })

  it("tells the attacker when the server declines a claim the defender has not answered yet", async () => {
    const { controller, repository } = harness({
      send: async ({ event }) => ({
        operationId: event.operationId,
        status: event.type === "commanderDamage.submitted" ? "declined" : "pending",
      }),
    })
    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment(ONLINE)

    controller.submitCommanderDamage("player-1", [{ toPlayerId: "player-2", delta: 5 }])
    await settle()

    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(controller.getSnapshot().changeError).toBe(
      "5 commander damage to Grace wasn't added. If they haven't answered your last claim yet, send it again after they do.",
    )
  })

  it("names the declined claim's own amount when coalesced life taps queue around it", async () => {
    const sentDeltas: number[] = []
    const { clock, controller } = harness({
      send: async ({ event }) => {
        if (event.type === "life.changed") sentDeltas.push(event.delta)
        return {
          operationId: event.operationId,
          status: event.type === "commanderDamage.submitted" ? "declined" : undefined,
        }
      },
    })
    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })
    const steps = [
      ...Array.from({ length: 3 }, () => () => controller.changeLife("player-1", -1)),
      () => controller.submitCommanderDamage("player-1", [{ toPlayerId: "player-2", delta: 7 }]),
      ...Array.from({ length: 2 }, () => () => controller.changeLife("player-1", -1)),
    ]
    for (const step of steps) {
      clock.time += 1
      step()
    }

    controller.setEnvironment(ONLINE)
    await settle()

    expect(sentDeltas).toEqual([-3, -2])
    expect(controller.getSnapshot().pending).toEqual([])
    expect(controller.getSnapshot().changeError).toBe(
      "7 commander damage to Grace wasn't added. If they haven't answered your last claim yet, send it again after they do.",
    )
  })

  it("queues one resolution when the defender taps Confirm twice", () => {
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

    controller.resolveCommanderDamage(claim, true)
    controller.resolveCommanderDamage(claim, true)

    expect(controller.getSnapshot().pending).toHaveLength(1)
  })

  it("shows a claim again after its resolution is rejected, so it can be resolved again", async () => {
    const { clock, controller } = harness({
      send: async () => {
        throw new Error("Game is not active")
      },
    })
    const claim = {
      claimId: "claim-1",
      operationId: "commander-claim-000001",
      fromPlayerId: "player-2",
      toPlayerId: "player-1",
      delta: 4,
      clientCreatedAt: clock.now(),
      createdAt: clock.now(),
    }
    controller.onRemoteProjection({
      ...projection(0, 20),
      commanderDamage: { totals: [], pendingClaims: [claim], eliminatedPlayerIds: [] },
    })
    const shownClaims = () =>
      controller
        .getSnapshot()
        .projection?.commanderDamage?.pendingClaims.map(({ operationId }) => operationId)

    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })
    controller.resolveCommanderDamage(claim, true)
    expect(shownClaims()).toEqual([])

    controller.setEnvironment(ONLINE)
    await settle()
    expect(controller.getSnapshot().failed).toHaveLength(1)
    expect(shownClaims()).toEqual([claim.operationId])

    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })
    controller.resolveCommanderDamage(claim, true)
    expect(controller.getSnapshot().pending).toHaveLength(1)
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
    expect(controller.getSnapshot().connectionStatus).toBe("syncing")
    expect(clock.scheduledDelays).toEqual([500])

    clock.advance(500)
    await settle()
    expect(attempts).toHaveLength(2)
    expect(controller.getSnapshot().pending).toEqual([])
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

  it("records a resumable row for a live projection and drops it on terminal state without destroying unsent intent", () => {
    const deployment = "small-ibis-123.convex.cloud"
    const { repository, controller } = harness({
      repository: new ConnectedGameRepository(new MemoryStorage(), "user-1", {}, deployment),
    })
    controller.setEnvironment(ONLINE)
    controller.changeLife("player-1", 5)

    controller.onRemoteProjection(projection(3, 25))
    expect(repository.loadResumeIndex().map((game) => game.publicId)).toEqual(["game-public"])

    controller.onRemoteProjection({ ...projection(4, 25), status: "finished" })
    expect(repository.loadResumeIndex()).toEqual([])
    expect(repository.loadProjection("game-public")).not.toBeNull()
    expect(controller.getSnapshot().pending).toHaveLength(1)
  })

  it("does not resurrect a confirmed terminal game from a stale active projection", () => {
    const { repository, controller } = harness({
      repository: new ConnectedGameRepository(
        new MemoryStorage(),
        "user-1",
        {},
        "small-ibis-123.convex.cloud",
      ),
    })
    controller.onRemoteProjection({ ...projection(5, 25), status: "finished" })
    expect(repository.loadResumeIndex()).toEqual([])

    controller.onRemoteProjection({ ...projection(3, 30), status: "active" })
    expect(repository.loadResumeIndex()).toEqual([])
  })

  it("keeps the row of an active game when a stale terminal projection arrives", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(
      storage,
      "user-1",
      {},
      "small-ibis-123.convex.cloud",
    )
    repository.saveProjection({ ...projection(2, 30), status: "active" })
    repository.syncResumeIndex(
      [
        {
          publicId: "game-public",
          status: "active",
          isHost: true,
          playerCount: 2,
          ruleset: "standard",
          updatedAt: 3,
        },
      ],
      true,
    )
    const { controller } = harness({ repository })
    controller.onRemoteProjection(projection(4, 25))
    controller.onRemoteProjection({ ...projection(1, 20), status: "finished" })
    expect(repository.loadResumeIndex().map((game) => game.publicId)).toEqual(["game-public"])
    expect(repository.loadProjection("game-public")?.status).toBe("active")
  })

  it("rewrites the resume row when only its activity timestamp advances", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(
      storage,
      "user-1",
      {},
      "small-ibis-123.convex.cloud",
    )
    const persistSpy = jest.spyOn(storage, "set")
    const resumeWrites = () =>
      persistSpy.mock.calls.filter(([key]) => String(key).includes("resume")).length
    const { controller } = harness({ repository })
    controller.onRemoteProjection(projection(1, 20))
    expect(resumeWrites()).toBe(1)

    controller.onRemoteProjection(projection(1, 20))
    expect(resumeWrites()).toBe(1)

    controller.onRemoteProjection(projection(2, 20))
    expect(resumeWrites()).toBe(2)
    expect(repository.loadResumeIndex()[0]?.updatedAt).toBe(3)
  })

  it("times another player's change from the server applying it, with the clock learned from this device's write", async () => {
    let reply!: () => void
    const { clock, controller } = harness({
      awaitProjectionBarrier: true,
      send: (queued) =>
        new Promise((resolve) => {
          reply = () => resolve({ operationId: queued.event.operationId })
        }),
    })
    controller.setEnvironment(ONLINE)
    controller.onRemoteProjection(projection(0, 20))

    clock.time = 1_000
    controller.changeLife("player-1", 5)
    await settle()
    const operationId = controller.getSnapshot().pending[0]?.event.operationId ?? ""
    controller.onRemoteProjection(
      { ...projection(1, 25), serverUpdatedAt: 5_020 },
      { status: "acknowledged", operationId, projectionEventSequence: 1 },
    )
    clock.time = 1_040
    reply()
    await settle()
    expect(controller.getSnapshot().pending).toEqual([])

    clock.time = 2_000
    controller.onRemoteProjection({ ...projection(2, 25), serverUpdatedAt: 5_900 })
    controller.latency.painted(2)

    expect(controller.latency.summary()).toMatchObject({
      delivery: { count: 1, p50: 100 },
      ack: { count: 1, p50: 40 },
      ping: 40,
    })
  })

  it("does not set its clock from a write that shares its projection with someone else's", async () => {
    const { clock, controller } = harness({ awaitProjectionBarrier: true })
    controller.setEnvironment(ONLINE)
    controller.onRemoteProjection(projection(0, 20))
    clock.time = 1_000
    controller.changeLife("player-1", 5)
    await settle()
    const operationId = controller.getSnapshot().pending[0]?.event.operationId ?? ""
    controller.onRemoteProjection(
      { ...projection(2, 25), serverUpdatedAt: 5_300 },
      { status: "acknowledged", operationId, projectionEventSequence: 2 },
    )
    await settle()
    expect(controller.getSnapshot().pending).toEqual([])
    controller.onRemoteProjection(projection(3, 25))
    controller.latency.painted(3)
    expect(controller.latency.summary().delivery).toBeUndefined()
  })

  it("keeps waiting for a fresh projection when a reconnect replays the cached one", () => {
    const { controller } = harness()
    controller.latency.setAuthority()
    controller.setEnvironment(ONLINE)
    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })
    controller.setEnvironment(ONLINE)
    controller.onRemoteProjection(projection(0, 20))
    controller.onRemoteProjection(projection(4, 20))
    controller.latency.painted(4)
    expect(controller.latency.summary().delivery).toBeUndefined()
    controller.onRemoteProjection(projection(5, 20))
    controller.latency.painted(5)
    expect(controller.latency.summary().delivery).toEqual(expect.objectContaining({ count: 1 }))
  })

  it("does not time a catch-up after reconnecting", () => {
    const { controller } = harness()
    controller.setEnvironment(ONLINE)
    controller.onRemoteProjection(projection(0, 20))
    controller.setEnvironment({ ...ONLINE, isWebSocketConnected: false })
    controller.setEnvironment(ONLINE)
    controller.onRemoteProjection(projection(4, 20))
    controller.latency.setAuthority()
    controller.latency.painted(4)
    expect(controller.latency.summary().delivery).toBeUndefined()
  })
})
