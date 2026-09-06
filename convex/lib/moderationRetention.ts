export const UPHELD_RETENTION_DAYS = 365
export const DISMISSED_RETENTION_DAYS = 90

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export const UPHELD_RETENTION_MS = UPHELD_RETENTION_DAYS * MILLISECONDS_PER_DAY
export const DISMISSED_RETENTION_MS = DISMISSED_RETENTION_DAYS * MILLISECONDS_PER_DAY

type ModerationReportStatus = "open" | "upheld" | "dismissed"

export function moderationRetentionExpiresAt(
  status: ModerationReportStatus,
  resolvedAt: number | undefined,
  createdAt: number,
): number | undefined {
  if (status === "open") return undefined
  const resolvedAtOrCreatedAt = resolvedAt ?? createdAt
  return (
    resolvedAtOrCreatedAt + (status === "upheld" ? UPHELD_RETENTION_MS : DISMISSED_RETENTION_MS)
  )
}
