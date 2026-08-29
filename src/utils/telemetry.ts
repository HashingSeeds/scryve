export type TelemetryEventName =
  | "join.completed"
  | "join.failed"
  | "reconnect.ready"
  | "outbox.drain"
  | "mutation.ack"
  | "error.handled"
  | "game.started"
  | "game.completed"
  | "game.dropped"
  | "deck.import"
  | "premium.blocked"

export type TelemetryPlatform = "ios" | "android" | "web"
export type TelemetryOutcome = "success" | "retry" | "rejected" | "cancelled"
export type TelemetryMode = "local" | "connected"
export type TelemetrySource = "link" | "scan" | "code" | "precon" | "manual"
export type TelemetryReason =
  "expired" | "invalid" | "full" | "network" | "permission" | "rate_limited" | "unknown"
export type TelemetryFeature = "deck_limit" | "version_limit" | "full_history" | "deck_analytics"
export type TelemetryErrorCode =
  "FATAL" | "HANDLED" | "AUTH_EXPIRED" | "MUTATION_REJECTED" | "NETWORK_UNAVAILABLE"

type SafeMetadata = {
  durationMs?: number
  attemptCount?: number
  pendingCount?: number
  acknowledgedCount?: number
  failedCount?: number
  playerCount?: number
  platform?: TelemetryPlatform
  outcome?: TelemetryOutcome
  mode?: TelemetryMode
  source?: TelemetrySource
  reason?: TelemetryReason
  feature?: TelemetryFeature
  errorCode?: TelemetryErrorCode
  analyticsId?: string
}

export interface TelemetryAdapter {
  emit(event: { name: TelemetryEventName; at: number; metadata: SafeMetadata }): void
}

const isNonNegativeCount = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

const isOneOf =
  <T extends string>(...values: readonly T[]) =>
  (value: unknown): boolean =>
    typeof value === "string" && (values as readonly string[]).includes(value)

const LOCALLY_MINTED_ANALYTICS_ID = /^analytics_[0-9a-f]{32}$/

const isLocallyMintedAnalyticsId = (value: unknown): boolean =>
  typeof value === "string" && LOCALLY_MINTED_ANALYTICS_ID.test(value)

const VALIDATORS: Record<keyof SafeMetadata, (value: unknown) => boolean> = {
  durationMs: isNonNegativeCount,
  attemptCount: isNonNegativeCount,
  pendingCount: isNonNegativeCount,
  acknowledgedCount: isNonNegativeCount,
  failedCount: isNonNegativeCount,
  playerCount: isNonNegativeCount,
  platform: isOneOf("ios", "android", "web"),
  outcome: isOneOf("success", "retry", "rejected", "cancelled"),
  mode: isOneOf("local", "connected"),
  source: isOneOf("link", "scan", "code", "precon", "manual"),
  reason: isOneOf("expired", "invalid", "full", "network", "permission", "rate_limited", "unknown"),
  feature: isOneOf("deck_limit", "version_limit", "full_history", "deck_analytics"),
  errorCode: isOneOf(
    "FATAL",
    "HANDLED",
    "AUTH_EXPIRED",
    "MUTATION_REJECTED",
    "NETWORK_UNAVAILABLE",
  ),
  analyticsId: isLocallyMintedAnalyticsId,
}

let adapter: TelemetryAdapter = { emit: () => undefined }

export function setTelemetryAdapter(next?: TelemetryAdapter): void {
  adapter = next ?? { emit: () => undefined }
}

export function emitTelemetry(
  name: TelemetryEventName,
  candidate: Record<string, unknown> = {},
): void {
  const metadata: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(candidate)) {
    const isAllowed = Object.prototype.hasOwnProperty.call(VALIDATORS, key)
    if (!isAllowed) continue
    if (VALIDATORS[key as keyof SafeMetadata](value)) metadata[key] = value
  }
  adapter.emit({ name, at: Date.now(), metadata: metadata as SafeMetadata })
}
