import * as kernel from "@/features/sync/durableOutbox"

import type { MemoryStorage } from "./storage"

export const QUARANTINE_PREFIX = "quarantine:"
export const SIDECAR_PREFIX = "meta:"

export type Design = "none" | "sidecar" | "inline"

export type Report = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const reports: Report[] = []

const capture = (report: unknown) => {
  reports.push(isRecord(report) ? report : { invalid: String(report) })
}

// why: each design names its startup hook differently; the harness looks them up at runtime so one folder runs against every branch.
const hook = (name: string): ((...args: unknown[]) => unknown) | undefined => {
  const candidate: unknown = Reflect.get(kernel, name)
  return typeof candidate === "function"
    ? (...args: unknown[]) => Reflect.apply(candidate, undefined, args)
    : undefined
}

/** why: points the outbox kernel at this harness: every quarantine report lands in `reports`, every write claims `writtenBy`. */
export function configureBuild(writtenBy: string) {
  const configure = hook("configureOutboxDiagnostics")
  if (configure) return void configure({ writtenBy, report: capture })
  hook("setQuarantineReporter")?.(capture)
  hook("setOutboxWriter")?.({ app: writtenBy, update: "stress", runtime: "stress" })
}

export const namesBuild = (writtenBy: unknown, build: string) =>
  writtenBy === build || (isRecord(writtenBy) && writtenBy.app === build)

export const takeReports = () => reports.splice(0, reports.length)

export const isQuarantineKey = (key: string) => key.startsWith(QUARANTINE_PREFIX)
export const isSidecarKey = (key: string) => key.startsWith(SIDECAR_PREFIX)

export function detectDesign(storage: MemoryStorage): Design {
  const keys = storage.getAllKeys()
  if (keys.some(isSidecarKey)) return "sidecar"
  if (keys.some((key) => /"writtenBy"\s*:/.test(storage.getString(key) ?? ""))) return "inline"
  return "none"
}

export function provenanceOf(storage: MemoryStorage, key: string): string | undefined {
  const sidecar = storage.getString(`${SIDECAR_PREFIX}${key}`)
  const fromSidecar = sidecar ? findWrittenBy(safeJson(sidecar)) : undefined
  return fromSidecar ?? findWrittenBy(safeJson(storage.getString(key)))
}

export function safeJson(value: string | undefined): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function findWrittenBy(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.writtenBy === "string") return value.writtenBy
  if (isRecord(value.writtenBy) && typeof value.writtenBy.app === "string")
    return value.writtenBy.app
  return isRecord(value.action) ? findWrittenBy(value.action) : undefined
}

export { isRecord }
