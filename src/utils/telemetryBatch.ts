import type { TelemetryAdapter, TelemetryEventName } from "./telemetry"

export interface TelemetryEvent {
  name: TelemetryEventName
  at: number
  metadata: Record<string, unknown>
}

export interface TelemetrySink {
  send(events: readonly TelemetryEvent[]): void | Promise<void>
}

export interface BatchingTelemetryOptions {
  sink: TelemetrySink
  getAnalyticsId?: () => string | undefined
  keepProbabilityByEvent?: Partial<Record<TelemetryEventName, number>>
  maxBatchSize?: number
  flushIntervalMs?: number
  maxBufferedEventsBeforeDroppingOldest?: number
  random?: () => number
  scheduleInterval?: (handler: () => void, ms: number) => { cancel: () => void }
}

export interface BatchingTelemetryAdapter extends TelemetryAdapter {
  flush(): Promise<void>
  stop(): Promise<void>
  pendingCount(): number
}

const DEFAULT_MAX_BATCH_SIZE = 25
const DEFAULT_FLUSH_INTERVAL_MS = 30_000
const DEFAULT_MAX_BUFFERED_EVENTS = 200

const defaultScheduleInterval = (handler: () => void, ms: number) => {
  const id = setInterval(handler, ms)
  return { cancel: () => clearInterval(id) }
}

export function createBatchingTelemetryAdapter(
  options: BatchingTelemetryOptions,
): BatchingTelemetryAdapter {
  const {
    sink,
    getAnalyticsId,
    keepProbabilityByEvent,
    maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    maxBufferedEventsBeforeDroppingOldest = DEFAULT_MAX_BUFFERED_EVENTS,
    random = Math.random,
    scheduleInterval = defaultScheduleInterval,
  } = options

  const batchSize =
    Number.isSafeInteger(maxBatchSize) && maxBatchSize > 0 ? maxBatchSize : DEFAULT_MAX_BATCH_SIZE

  let buffer: TelemetryEvent[] = []
  let inFlight: Promise<void> | null = null
  let stopped = false

  const timer = scheduleInterval(() => {
    void flush()
  }, flushIntervalMs)

  function survivesSampling(name: TelemetryEventName): boolean {
    const keepProbability = keepProbabilityByEvent?.[name]
    if (keepProbability === undefined) return true
    if (keepProbability <= 0) return false
    if (keepProbability >= 1) return true
    return random() < keepProbability
  }

  async function sendDiscardingBatchOnFailure(batch: readonly TelemetryEvent[]): Promise<void> {
    try {
      await sink.send(batch)
    } catch {
      return
    }
  }

  async function drain(): Promise<void> {
    while (buffer.length > 0) {
      const batch = buffer.slice(0, batchSize)
      buffer = buffer.slice(batch.length)
      await sendDiscardingBatchOnFailure(batch)
    }
  }

  async function flush(): Promise<void> {
    if (inFlight) return inFlight
    if (buffer.length === 0) return
    inFlight = drain().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  return {
    emit(event) {
      if (stopped || !survivesSampling(event.name)) return
      const analyticsId = getAnalyticsId?.()
      buffer.push({
        name: event.name,
        at: event.at,
        metadata: analyticsId ? { ...event.metadata, analyticsId } : { ...event.metadata },
      })
      if (buffer.length > maxBufferedEventsBeforeDroppingOldest)
        buffer = buffer.slice(buffer.length - maxBufferedEventsBeforeDroppingOldest)
      if (buffer.length >= batchSize) void flush()
    },
    flush,
    async stop() {
      stopped = true
      timer.cancel()
      await flush()
    },
    pendingCount: () => buffer.length,
  }
}

export function combineTelemetryAdapters(
  ...adapters: readonly TelemetryAdapter[]
): TelemetryAdapter {
  return {
    emit(event) {
      for (const adapter of adapters) adapter.emit(event)
    },
  }
}
