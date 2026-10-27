import { captureAnalytics } from "@/utils/analytics"

// why: a long game would otherwise grow these forever; the newest samples are the ones worth keeping.
const MAX_SAMPLES = 2_000
// why: phone clocks drift a few ms a minute, so a best ping this old no longer pins the offset.
const CLOCK_STALE_MS = 60_000
const MAX_TRACKED_WRITES = 32

export type SyncTransport = { transport: "cloud" } | { transport: "nearby"; role: "host" | "guest" }

export interface LatencyStats {
  count: number
  p50: number
  p90: number
  p99: number
  over500: number
  over1000: number
}

export interface SyncLatencySummary {
  delivery?: LatencyStats
  ack?: LatencyStats
  ping?: number
}

export function latencyStats(samples: readonly number[]): LatencyStats | undefined {
  if (samples.length === 0) return undefined
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p: number) =>
    Math.round(sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0)
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p90: percentile(0.9),
    p99: percentile(0.99),
    over500: sorted.filter((sample) => sample > 500).length,
    over1000: sorted.filter((sample) => sample > 1_000).length,
  }
}

const keepNewest = (samples: number[], sample: number) => {
  samples.push(sample)
  if (samples.length > MAX_SAMPLES) samples.shift()
}

/** why: paints wait on this device's clock until the authority offset is known, so a player who never writes still gets numbers once a clock sample lands. */
export class SyncLatency {
  private clock?: { offset: number; rtt: number; at: number }
  private paints: number[] = []
  private acks: number[] = []
  private unpainted: { authorityAt: number; eventSequence: number }[] = []
  private writes = new Map<string, { sentAt?: number; returnedAt?: number; authorityAt?: number }>()

  constructor(
    readonly context: SyncTransport,
    private readonly now: () => number = Date.now,
  ) {}

  setAuthority(): void {
    this.clock = { offset: 0, rtt: 0, at: Number.POSITIVE_INFINITY }
  }

  clockSample(sentAt: number, receivedAt: number, authorityAt: number): void {
    const rtt = receivedAt - sentAt
    if (rtt < 0) return
    const best = this.clock
    if (best && best.rtt <= rtt && receivedAt - best.at < CLOCK_STALE_MS) return
    this.clock = { offset: authorityAt - (sentAt + receivedAt) / 2, rtt, at: receivedAt }
  }

  /** why: a cloud write's reply and the projection carrying its server time arrive in either order. */
  ownWrite(
    operationId: string,
    part: { sentAt: number; returnedAt: number } | { authorityAt: number },
  ): void {
    const write = { ...this.writes.get(operationId), ...part }
    if (
      write.sentAt === undefined ||
      write.returnedAt === undefined ||
      write.authorityAt === undefined
    ) {
      this.writes.set(operationId, write)
      const [oldest] = this.writes.keys()
      if (this.writes.size > MAX_TRACKED_WRITES && oldest) this.writes.delete(oldest)
      return
    }
    this.writes.delete(operationId)
    this.clockSample(write.sentAt, write.returnedAt, write.authorityAt)
  }

  remoteChange(authorityAt: number, eventSequence: number): void {
    this.unpainted.push({ authorityAt, eventSequence })
  }

  painted(eventSequence: number): void {
    const at = this.now()
    this.unpainted = this.unpainted.filter((change) => {
      if (change.eventSequence > eventSequence) return true
      keepNewest(this.paints, at - change.authorityAt)
      return false
    })
  }

  acknowledged(durationMs: number): void {
    keepNewest(this.acks, durationMs)
  }

  summary(): SyncLatencySummary {
    const { clock } = this
    // why: a slightly-off offset can put a fast paint a few ms before the authority applied it.
    const delivery =
      clock && latencyStats(this.paints.map((paint) => Math.max(0, paint + clock.offset)))
    const ack = latencyStats(this.acks)
    return {
      ...(delivery ? { delivery } : {}),
      ...(ack ? { ack } : {}),
      ...(clock && clock.rtt > 0 ? { ping: Math.round(clock.rtt) } : {}),
    }
  }

  /** why: clears what it sends, so a remount or the game ending never reports a sample twice. */
  report(): void {
    const { delivery, ack, ping } = this.summary()
    this.paints = []
    this.acks = []
    if (!delivery && !ack) return
    captureAnalytics("sync_latency", {
      transport: this.context.transport,
      ...(this.context.transport === "nearby" ? { role: this.context.role } : {}),
      ...(delivery && {
        delivery_count: delivery.count,
        delivery_p50: delivery.p50,
        delivery_p90: delivery.p90,
        delivery_p99: delivery.p99,
        delivery_over_500: delivery.over500,
        delivery_over_1000: delivery.over1000,
      }),
      ...(ack && { ack_count: ack.count, ack_p50: ack.p50, ack_p90: ack.p90, ack_p99: ack.p99 }),
      ...(ping !== undefined && { ping_ms: ping }),
    })
  }
}
