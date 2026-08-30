import { createBatchingTelemetryAdapter, combineTelemetryAdapters } from "./telemetryBatch"
import type { TelemetryEvent } from "./telemetryBatch"

const noopSchedule = () => ({ cancel: () => undefined })

function makeEvent(name: TelemetryEvent["name"] = "game.started"): TelemetryEvent {
  return { name, at: 1, metadata: {} }
}

const event = () => makeEvent()

describe("batching telemetry adapter", () => {
  it("holds events until the batch size is reached", async () => {
    const send = jest.fn()
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      maxBatchSize: 3,
      scheduleInterval: noopSchedule,
    })

    adapter.emit(event())
    adapter.emit(event())
    expect(send).not.toHaveBeenCalled()
    expect(adapter.pendingCount()).toBe(2)

    adapter.emit(event())
    await adapter.flush()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toHaveLength(3)
    expect(adapter.pendingCount()).toBe(0)
  })

  it("stamps the analytics id onto every event", async () => {
    const send = jest.fn()
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      getAnalyticsId: () => "analytics_" + "a".repeat(32),
      scheduleInterval: noopSchedule,
    })

    adapter.emit(event())
    await adapter.flush()

    expect(send.mock.calls[0][0][0].metadata).toEqual({
      analyticsId: "analytics_" + "a".repeat(32),
    })
  })

  it("drops sampled-out events", async () => {
    const send = jest.fn()
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      keepProbabilityByEvent: { "mutation.ack": 0.5 },
      random: () => 0.9,
      scheduleInterval: noopSchedule,
    })

    adapter.emit(makeEvent("mutation.ack"))
    expect(adapter.pendingCount()).toBe(0)

    adapter.emit(makeEvent("game.started"))
    expect(adapter.pendingCount()).toBe(1)
    await adapter.flush()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("drops the oldest events past the buffer ceiling", async () => {
    const send = jest.fn()
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      maxBatchSize: 1000,
      maxBufferedEventsBeforeDroppingOldest: 2,
      scheduleInterval: noopSchedule,
    })

    adapter.emit({ name: "game.started", at: 1, metadata: {} })
    adapter.emit({ name: "game.started", at: 2, metadata: {} })
    adapter.emit({ name: "game.started", at: 3, metadata: {} })

    expect(adapter.pendingCount()).toBe(2)
    await adapter.flush()
    expect(send.mock.calls[0][0].map((e: TelemetryEvent) => e.at)).toEqual([2, 3])
  })

  it("does not throw or retain the batch when the sink fails", async () => {
    const send = jest.fn(() => {
      throw new Error("network down")
    })
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      scheduleInterval: noopSchedule,
    })

    adapter.emit(event())
    await expect(adapter.flush()).resolves.toBeUndefined()
    expect(adapter.pendingCount()).toBe(0)
  })

  it("flushes and stops accepting events after stop", async () => {
    const send = jest.fn()
    const cancel = jest.fn()
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      scheduleInterval: () => ({ cancel }),
    })

    adapter.emit(event())
    await adapter.stop()

    expect(send).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalled()

    adapter.emit(event())
    expect(adapter.pendingCount()).toBe(0)
  })

  it("flushes on the scheduled interval", async () => {
    const send = jest.fn()
    let tick = () => undefined as void
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      scheduleInterval: (handler) => {
        tick = handler
        return { cancel: () => undefined }
      },
    })

    adapter.emit(event())
    tick()
    await adapter.flush()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it("keeps draining when maxBatchSize is not a usable size", async () => {
    const send = jest.fn(async () => undefined)
    const adapter = createBatchingTelemetryAdapter({
      sink: { send },
      maxBatchSize: 0,
      scheduleInterval: () => ({ cancel: () => undefined }),
    })

    adapter.emit(event())
    adapter.emit(event())

    await expect(adapter.flush()).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1)
    expect(adapter.pendingCount()).toBe(0)
  })
})

describe("combineTelemetryAdapters", () => {
  it("fans one event out to every adapter", () => {
    const a = { emit: jest.fn() }
    const b = { emit: jest.fn() }

    combineTelemetryAdapters(a, b).emit({ name: "game.started", at: 5, metadata: {} })

    expect(a.emit).toHaveBeenCalledTimes(1)
    expect(b.emit).toHaveBeenCalledTimes(1)
  })
})
