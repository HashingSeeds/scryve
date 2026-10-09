import { type Design, isQuarantineKey, isSidecarKey, provenanceOf, SIDECAR_PREFIX } from "./design"
import type { Lane } from "./lanes"
import { type MemoryStorage, utf8Bytes } from "./storage"

/** why: where an operation should be after a reload. `gone` covers acked, dismissed, and never written. */
export type OpState = "pending" | "failed" | "gone" | "quarantined"

export type ViolationKind =
  | "lost"
  | "resurrected"
  | "duplicate"
  | "wrong-slot"
  | "misquarantined"
  | "orphan-provenance"
  | "limit"

export interface Violation {
  kind: ViolationKind
  detail: string
}

export interface Observation {
  pending: string[]
  failed: string[]
  quarantined: Map<string, number>
  provenanceKnown: number
  liveRecords: number
}

export function quarantinedOperations(lane: Lane, storage: MemoryStorage) {
  const found = new Map<string, number>()
  for (const key of storage.getAllKeys()) {
    if (!isQuarantineKey(key)) continue
    for (const prefix of [lane.pendingPrefix, lane.failedPrefix]) {
      const at = key.indexOf(prefix)
      if (at < 0) continue
      const operationId = key.slice(at + prefix.length).split(":")[0]
      found.set(operationId, (found.get(operationId) ?? 0) + 1)
    }
  }
  return found
}

const liveRecordKeys = (storage: MemoryStorage, prefix: string) =>
  storage.getAllKeys().filter((key) => key.startsWith(prefix))

/** why: reloads a copy of storage with the branch build, as the next app launch would, and reports what survived. */
export function observe(
  lane: Lane,
  disk: MemoryStorage,
): { observation: Observation; after: MemoryStorage } {
  const after = disk.clone()
  const repo = lane.open(after)
  const pending = repo.pending().map((action) => lane.operationId(action))
  const failed = repo.failed().map((failure) => lane.failedOperationId(failure))
  const live = [
    ...liveRecordKeys(after, lane.pendingPrefix),
    ...liveRecordKeys(after, lane.failedPrefix),
  ]
  return {
    after,
    observation: {
      pending,
      failed,
      quarantined: quarantinedOperations(lane, after),
      provenanceKnown: live.filter((key) => provenanceOf(after, key) !== undefined).length,
      liveRecords: live.length,
    },
  }
}

export function orphanSidecars(storage: MemoryStorage) {
  return storage
    .getAllKeys()
    .filter(
      (key) =>
        isSidecarKey(key) && storage.getString(key.slice(SIDECAR_PREFIX.length)) === undefined,
    )
}

function limitViolations(lane: Lane, storage: MemoryStorage): Violation[] {
  const violations: Violation[] = []
  const slots = [
    ["pending", lane.pendingPrefix, lane.limits.maxPendingRecords, lane.limits.maxPendingBytes],
    ["failed", lane.failedPrefix, lane.limits.maxFailedRecords, lane.limits.maxFailedBytes],
  ] as const
  for (const [slot, prefix, maxRecords, maxBytes] of slots) {
    const keys = liveRecordKeys(storage, prefix)
    const bytes = keys.reduce((total, key) => total + utf8Bytes(storage.getString(key) ?? ""), 0)
    if (keys.length > maxRecords)
      violations.push({ kind: "limit", detail: `${slot} records ${keys.length} > ${maxRecords}` })
    if (bytes > maxBytes)
      violations.push({ kind: "limit", detail: `${slot} bytes ${bytes} > ${maxBytes}` })
  }
  return violations
}

const observedState = (operationId: string, observation: Observation): OpState | "both" => {
  const pending = observation.pending.includes(operationId)
  const failed = observation.failed.includes(operationId)
  if (pending && failed) return "both"
  if (pending) return "pending"
  if (failed) return "failed"
  return observation.quarantined.has(operationId) ? "quarantined" : "gone"
}

function mismatch(expected: readonly OpState[], actual: OpState): ViolationKind {
  if (actual === "gone") return "lost"
  if (expected.includes("gone") && !expected.includes(actual)) return "resurrected"
  if (actual === "quarantined" || expected.includes("quarantined")) return "misquarantined"
  return "wrong-slot"
}

/**
 * why: compares a reload with what the ledger says each operation should be.
 * `uncertain` holds operations a fault interrupted: either their old or new state is fine.
 * The ledger is updated to what was observed so one fault reports once.
 */
export function verify(
  lane: Lane,
  ledger: Map<string, OpState>,
  uncertain: ReadonlyMap<string, readonly OpState[]>,
  disk: MemoryStorage,
  design: Design,
): { violations: Violation[]; observation: Observation } {
  const { observation, after } = observe(lane, disk)
  const violations: Violation[] = []
  for (const list of [observation.pending, observation.failed])
    for (const operationId of new Set(list.filter((id, index) => list.indexOf(id) !== index)))
      violations.push({ kind: "duplicate", detail: `${operationId} listed twice` })
  const known = new Set([...ledger.keys(), ...uncertain.keys()])
  for (const operationId of [...observation.pending, ...observation.failed])
    if (!known.has(operationId))
      violations.push({ kind: "resurrected", detail: `${operationId} was never queued` })
  for (const operationId of known) {
    const expected = uncertain.get(operationId) ?? [ledger.get(operationId) ?? "gone"]
    const actual = observedState(operationId, observation)
    if (actual === "both") {
      violations.push({ kind: "duplicate", detail: `${operationId} is both pending and failed` })
      ledger.set(operationId, "failed")
      continue
    }
    if (!expected.includes(actual))
      violations.push({
        kind: mismatch(expected, actual),
        detail: `${operationId} expected ${expected.join("|")} got ${actual}`,
      })
    ledger.set(operationId, actual)
  }
  if (design === "sidecar")
    for (const key of orphanSidecars(after))
      violations.push({ kind: "orphan-provenance", detail: key.slice(0, 80) })
  violations.push(...limitViolations(lane, after))
  return { violations, observation }
}
