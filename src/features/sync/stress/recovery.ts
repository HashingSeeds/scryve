import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { DurableStringStorage } from "@/features/sync/durableOutbox"

import { getPath, renamePath, setPath, type Fix } from "./corruption"
import { type Design, isRecord, QUARANTINE_PREFIX, safeJson, SIDECAR_PREFIX } from "./design"

/**
 * why: this is the recovering codec a developer would ship after reading a quarantine report.
 * Design-specific steps are separate functions so `recoveryLoc` can price each design.
 */
export function recoverQuarantined(
  storage: DurableStringStorage,
  recordPrefix: string,
  fix: Fix,
  requeue: (record: Record<string, unknown>) => boolean,
  design: Design | "core",
): number {
  let recovered = 0
  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(QUARANTINE_PREFIX) || !key.includes(recordPrefix)) continue
    const record = safeJson(storage.getString(key))
    if (!isRecord(record)) continue
    applyFix(record, fix)
    if (design === "inline") forgetInlineWriter(record)
    if (!requeue(record)) continue
    storage.delete(key)
    if (design === "sidecar") dropQuarantineSidecar(storage, key)
    recovered += 1
  }
  return recovered
}

function applyFix(record: Record<string, unknown>, fix: Fix) {
  if (fix.kind === "rename") return renamePath(record, fix.from, fix.to)
  const current = getPath(record, fix.path)
  setPath(record, fix.path, fix.to === "number" ? Number(current) : String(current))
}

function forgetInlineWriter(record: Record<string, unknown>) {
  delete record.writtenBy
}

function dropQuarantineSidecar(storage: DurableStringStorage, key: string) {
  storage.delete(`${SIDECAR_PREFIX}${key}`)
}

const source = () => readFileSync(join(__dirname, "recovery.ts"), "utf8").split("\n")

const bodyLines = (lines: readonly string[], name: string) => {
  const start = lines.findIndex(
    (line) => line.startsWith(`function ${name}(`) || line.startsWith(`export function ${name}(`),
  )
  const end = lines.findIndex((line, index) => index > start && line === "}")
  return lines.slice(start + 1, end).filter((line) => line.trim() && !line.includes("): number {"))
}

/** why: LOC is read from this file's source so the scorecard stays honest when the recovery code changes. */
export function recoveryLoc(design: Design | "core"): number {
  const lines = source()
  const designCall = (line: string) => /design === "(inline|sidecar)"/.test(line)
  const core =
    bodyLines(lines, "recoverQuarantined").filter(
      (line) => !designCall(line) && !/^\s+(storage|recordPrefix|fix|requeue|design):/.test(line),
    ).length + bodyLines(lines, "applyFix").length
  if (design === "inline") return core + 1 + bodyLines(lines, "forgetInlineWriter").length
  if (design === "sidecar") return core + 1 + bodyLines(lines, "dropQuarantineSidecar").length
  return core
}
