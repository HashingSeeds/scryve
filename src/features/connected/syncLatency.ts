import { captureAnalytics } from "@/utils/analytics"

import type { LastChange } from "../../../convex/lib/gameRules"

// why: a long game would otherwise grow these forever; the newest samples are the ones worth keeping.
const MAX_SAMPLES = 2_000
// why: phone clocks drift a few ms a minute, so a best ping this old no longer pins the offset.
const CLOCK_STALE_MS = 60_000
const MAX_TRACKED_WRITES = 32
// why: frames can stall without the app leaving the foreground, and a stalled backlog measures the stall.
const MAX_UNPAINTED = 16
// why: a change queued offline reaches the table long after its tap, and that wait is time offline, not sync.
const MAX_TAP_TO_PAINT_MS = 30_000

export type SyncTransport = { transport: "cloud" } | { transport: "nearby"; role: "host" | "guest" }
// why: games and events report the same event; old builds send no scope, so a missing scope means a game.
export type SyncContext = SyncTransport & { readonly scope?: "event" }

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
  tapOwn?: LatencyStats
  tapCross?: LatencyStats
  ping?: number
}

export interface PeerLatency {
  name: string
  summary: SyncLatencySummary
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

export class SyncLatency {
  private clock?: { offset: number; rtt: number; at: number }
  private paints: number[] = []
  // why: paints before the first clock sample are kept on this device's clock and corrected once it lands; later ones keep the offset they were painted under.
  private uncorrected: number[] = []
  private acks: number[] = []
  private taps = { own: [] as number[], cross: [] as number[] }
  private unpainted: { authorityAt: number; eventSequence: number; tap?: LastChange }[] = []
  private paused = false
  private backAt = 0
  private writes = new Map<string, { sentAt?: number; returnedAt?: number; authorityAt?: number }>()

  constructor(
    readonly context: SyncContext,
    private readonly now: () => number = () => Date.now(),
  ) {}

  authorityTime(localTime: number): number | undefined {
    return this.clock && Math.round(localTime + this.clock.offset)
  }

  setAuthority(): void {
    this.clock = { offset: 0, rtt: 0, at: Number.POSITIVE_INFINITY }
  }

  clockSample(sentAt: number, receivedAt: number, authorityAt: number): void {
    const rtt = receivedAt - sentAt
    if (rtt < 0) return
    const best = this.clock
    if (best && best.rtt <= rtt && receivedAt - best.at < CLOCK_STALE_MS) return
    const offset = authorityAt - (sentAt + receivedAt) / 2
    this.clock = { offset, rtt, at: receivedAt }
    for (const paint of this.uncorrected.splice(0)) this.keepPaint(paint, offset)
  }

  // why: a slightly-off offset can put a fast paint a few ms before the authority applied it.
  private keepPaint(paint: number, offset: number) {
    keepNewest(this.paints, Math.max(0, paint + offset))
  }

  /** why: a cloud write's reply and the projection carrying its server time arrive in either order, and only the first projection after the write carries its time. */
  ownWrite(
    operationId: string,
    part: { sentAt: number; returnedAt: number } | { authorityAt: number },
  ): void {
    const write = { ...part, ...this.writes.get(operationId) }
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

  /** why: a background app or hidden web tab keeps receiving changes but paints none, so timing them would measure the time away. */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.unpainted = []
    else this.backAt = this.now()
  }

  remoteChange(authorityAt: number, eventSequence: number, tap?: LastChange): void {
    if (this.paused) return
    if (this.unpainted.length >= MAX_UNPAINTED) this.unpainted = []
    this.unpainted.push({ authorityAt, eventSequence, ...(tap ? { tap } : {}) })
  }

  painted(eventSequence: number): void {
    const at = this.now()
    this.unpainted = this.unpainted.filter((change) => {
      if (change.eventSequence > eventSequence) return true
      const paint = at - change.authorityAt
      if (this.clock) this.keepPaint(paint, this.clock.offset)
      else keepNewest(this.uncorrected, paint)
      if (this.clock && change.tap) this.keepTap(change.tap, at + this.clock.offset)
      return false
    })
  }

  private keepTap({ tappedAt, crossSeat }: LastChange, paintedAt: number) {
    const sample = paintedAt - tappedAt
    if (sample > MAX_TAP_TO_PAINT_MS) return
    keepNewest(crossSeat ? this.taps.cross : this.taps.own, Math.max(0, sample))
  }

  acknowledged(durationMs: number): void {
    keepNewest(this.acks, durationMs)
  }

  /** why: a command sent before the app went away and settled after it came back would time the time away. */
  commandShown(sentAt: number): void {
    if (this.paused || sentAt < this.backAt) return
    keepNewest(this.acks, this.now() - sentAt)
  }

  summary(): SyncLatencySummary {
    const { clock } = this
    const delivery = latencyStats(this.paints)
    const ack = latencyStats(this.acks)
    const tapOwn = latencyStats(this.taps.own)
    const tapCross = latencyStats(this.taps.cross)
    return {
      ...(delivery ? { delivery } : {}),
      ...(ack ? { ack } : {}),
      ...(tapOwn ? { tapOwn } : {}),
      ...(tapCross ? { tapCross } : {}),
      ...(clock && clock.rtt > 0 ? { ping: Math.round(clock.rtt) } : {}),
    }
  }

  /** why: clears what it sends, so a remount or the game ending never reports a sample twice. */
  report(): void {
    const { delivery, ack, tapOwn, tapCross, ping } = this.summary()
    this.paints = []
    this.uncorrected = []
    this.acks = []
    this.taps = { own: [], cross: [] }
    if (!delivery && !ack) return
    captureAnalytics("sync_latency", {
      transport: this.context.transport,
      ...(this.context.transport === "nearby" ? { role: this.context.role } : {}),
      ...(this.context.scope ? { scope: this.context.scope } : {}),
      ...(delivery && {
        delivery_count: delivery.count,
        delivery_p50: delivery.p50,
        delivery_p90: delivery.p90,
        delivery_p99: delivery.p99,
        delivery_over_500: delivery.over500,
        delivery_over_1000: delivery.over1000,
      }),
      ...(ack && { ack_count: ack.count, ack_p50: ack.p50, ack_p90: ack.p90, ack_p99: ack.p99 }),
      ...(tapOwn && {
        e2e_own_count: tapOwn.count,
        e2e_own_p50: tapOwn.p50,
        e2e_own_p90: tapOwn.p90,
        e2e_own_p99: tapOwn.p99,
      }),
      ...(tapCross && {
        e2e_cross_count: tapCross.count,
        e2e_cross_p50: tapCross.p50,
        e2e_cross_p90: tapCross.p90,
        e2e_cross_p99: tapCross.p99,
      }),
      ...(ping !== undefined && { ping_ms: ping }),
    })
  }
}

const isMs = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

function parseStats(value: unknown): LatencyStats | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const { count, p50, p90, p99, over500, over1000 } = value as Record<string, unknown>
  return isMs(count) && isMs(p50) && isMs(p90) && isMs(p99) && isMs(over500) && isMs(over1000)
    ? { count, p50, p90, p99, over500, over1000 }
    : undefined
}

export function parseLatencySummary(value: unknown): SyncLatencySummary | null {
  if (typeof value !== "object" || value === null) return null
  const { delivery, ack, tapOwn, tapCross, ping } = value as Record<string, unknown>
  const parsedDelivery = parseStats(delivery)
  const parsedAck = parseStats(ack)
  const parsedTapOwn = parseStats(tapOwn)
  const parsedTapCross = parseStats(tapCross)
  return {
    ...(parsedDelivery ? { delivery: parsedDelivery } : {}),
    ...(parsedAck ? { ack: parsedAck } : {}),
    ...(parsedTapOwn ? { tapOwn: parsedTapOwn } : {}),
    ...(parsedTapCross ? { tapCross: parsedTapCross } : {}),
    ...(isMs(ping) ? { ping } : {}),
  }
}
