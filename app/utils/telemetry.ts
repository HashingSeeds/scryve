export type TelemetryEventName =
  | "join.completed"
  | "join.failed"
  | "reconnect.ready"
  | "outbox.drain"
  | "mutation.ack"
  | "error.handled"

type SafeMetadata = {
  durationMs?: number
  attemptCount?: number
  pendingCount?: number
  acknowledgedCount?: number
  failedCount?: number
  platform?: "ios" | "android" | "web"
  outcome?: "success" | "retry" | "rejected" | "cancelled"
  errorCode?: "FATAL" | "HANDLED" | "AUTH_EXPIRED" | "MUTATION_REJECTED" | "NETWORK_UNAVAILABLE"
}

export interface TelemetryAdapter {
  emit(event: { name: TelemetryEventName; at: number; metadata: SafeMetadata }): void
}

const ALLOWED = new Set<keyof SafeMetadata>([
  "durationMs",
  "attemptCount",
  "pendingCount",
  "acknowledgedCount",
  "failedCount",
  "platform",
  "outcome",
  "errorCode",
])
const ERROR_CODES = new Set<NonNullable<SafeMetadata["errorCode"]>>([
  "FATAL",
  "HANDLED",
  "AUTH_EXPIRED",
  "MUTATION_REJECTED",
  "NETWORK_UNAVAILABLE",
])

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
    if (!ALLOWED.has(key as keyof SafeMetadata)) continue
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) metadata[key] = value
    if (key === "platform" && (value === "ios" || value === "android" || value === "web"))
      metadata[key] = value
    if (
      key === "outcome" &&
      (value === "success" || value === "retry" || value === "rejected" || value === "cancelled")
    )
      metadata[key] = value
    if (key === "errorCode" && ERROR_CODES.has(value as NonNullable<SafeMetadata["errorCode"]>))
      metadata[key] = value
  }
  adapter.emit({ name, at: Date.now(), metadata: metadata as SafeMetadata })
}
