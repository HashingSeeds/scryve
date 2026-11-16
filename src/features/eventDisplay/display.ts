import { normalizeManualCode } from "@/features/connected/inviteLinks"
import { formatDuration } from "@/i18n/format"
import { normalizeHttpsOrigin } from "@/utils/httpsOrigin"

import type { EventClock } from "../../../convex/lib/events/commands"

export function eventDisplayUrl(origin: string, code: string) {
  const site = normalizeHttpsOrigin(origin)
  const eventCode = normalizeManualCode(code)
  return site && eventCode ? `${site}/e/${eventCode}` : null
}

export function formatClock(ms: number) {
  return formatDuration(Math.ceil(ms / 1000) || 0)
}

export type ClockPhase = "running" | "paused" | "time"

export function clockPhase(clock: EventClock, remainingMs: number): ClockPhase {
  if (remainingMs <= 0) return "time"
  return clock.pausedAt === undefined ? "running" : "paused"
}

export function chunk<T>(items: readonly T[], size: number) {
  const step = Math.max(1, Math.floor(size))
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += step)
    chunks.push(items.slice(start, start + step))
  return chunks
}

export function fitGrid(area: {
  count: number
  width: number
  height: number
  rowHeight: number
  minColumnWidth: number
}) {
  const maxRows = Math.max(1, Math.floor(area.height / area.rowHeight))
  const maxColumns = Math.max(1, Math.floor(area.width / area.minColumnWidth))
  const columns = Math.min(maxColumns, Math.max(1, Math.ceil(area.count / maxRows)))
  const rows = Math.min(maxRows, Math.max(1, Math.ceil(area.count / columns)))
  return { rows, columns, pages: Math.max(1, Math.ceil(area.count / (rows * columns))) }
}
