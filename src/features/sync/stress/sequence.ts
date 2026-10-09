import type { Design } from "./design"
import { type OpState, verify, type Violation } from "./invariants"
import { type BuildName, FAKE_IDS, type Lane, type LaneRepo } from "./lanes"
import {
  type Fault,
  FaultyStorage,
  MemoryStorage,
  type Random,
  seededRandom,
  SimulatedKill,
  SimulatedWriteError,
} from "./storage"

export type StepKind =
  "enqueue" | "ack" | "attempt" | "fail" | "dismiss" | "reload" | "corrupt" | "extra"

const WEIGHTS: ReadonlyArray<readonly [StepKind, number]> = [
  ["enqueue", 34],
  ["ack", 14],
  ["attempt", 10],
  ["fail", 12],
  ["dismiss", 6],
  ["reload", 10],
  ["corrupt", 5],
  ["extra", 4],
]

const TOTAL_WEIGHT = WEIGHTS.reduce((total, [, weight]) => total + weight, 0)

function pickStep(random: Random): StepKind {
  let roll = random.int(TOTAL_WEIGHT)
  for (const [kind, weight] of WEIGHTS) {
    if (roll < weight) return kind
    roll -= weight
  }
  return "enqueue"
}

const GARBAGE = ["", '{"schemaVersion":1,"event":', '{"schemaVersion":99}', "[]"] as const

export interface SequenceOptions {
  seed: number
  steps: number
  design: Design
  fault?: Fault
  build?: BuildName
  fill?: boolean
}

export interface SequenceResult {
  writes: number
  violations: Violation[]
  checks: number
  provenanceKnown: number
  liveRecords: number
}

const isFault = (error: unknown) =>
  error instanceof SimulatedKill || error instanceof SimulatedWriteError

/**
 * why: plays one seeded sequence of outbox operations against a lane, injecting at most one storage fault,
 * and checks every invariant after each reload.
 */
export function runSequence(lane: Lane, options: SequenceOptions): SequenceResult {
  const random = seededRandom(options.seed)
  const disk = new MemoryStorage()
  let storage = new FaultyStorage(disk, options.fault)
  let repo: LaneRepo = lane.open(storage, options.build)
  const ledger = new Map<string, OpState>()
  let uncertain = new Map<string, readonly OpState[]>()
  const violations: Violation[] = []
  let checks = 0
  let clock = 1_700_000_000_000
  let provenance = { known: 0, live: 0 }

  const check = () => {
    const result = verify(lane, ledger, uncertain, disk, options.design)
    violations.push(...result.violations)
    provenance = { known: result.observation.provenanceKnown, live: result.observation.liveRecords }
    uncertain = new Map()
    checks += 1
  }

  const inFlight = (operationId: string, ...allowed: OpState[]) =>
    uncertain.set(operationId, allowed)

  for (let step = 0; step < options.steps; step += 1) {
    clock += 1_000
    const kind = options.fill ? "enqueue" : pickStep(random)
    try {
      const pending = repo.pending()
      const failed = repo.failed()
      if (kind === "enqueue") {
        const action = lane.makeAction(random, clock, FAKE_IDS)
        const operationId = lane.operationId(action)
        inFlight(operationId, "gone", "pending")
        ledger.set(operationId, repo.enqueue(action) ? "pending" : "gone")
      } else if (kind === "ack") {
        const target = random.pick(pending)
        if (target) {
          const operationId = lane.operationId(target)
          inFlight(operationId, "pending", "gone")
          repo.attempt(operationId, clock)
          repo.ack(operationId)
          ledger.set(operationId, "gone")
        }
      } else if (kind === "attempt") {
        const target = random.pick(pending)
        if (target) repo.attempt(lane.operationId(target), clock)
      } else if (kind === "fail") {
        const target = random.pick(pending)
        if (target) {
          const operationId = lane.operationId(target)
          inFlight(operationId, "pending", "failed")
          const accepted = repo.fail(target, "stress rejection", clock, failed, pending)
          ledger.set(operationId, accepted ? "failed" : "pending")
        }
      } else if (kind === "dismiss") {
        const target = random.pick(failed)
        if (target) {
          const operationId = lane.failedOperationId(target)
          inFlight(operationId, "failed", "gone")
          repo.dismiss(operationId)
          ledger.set(operationId, "gone")
        }
      } else if (kind === "reload") {
        repo = lane.open(storage, options.build)
        check()
      } else if (kind === "corrupt") {
        const candidates = [...ledger].filter(
          ([, state]) => state === "pending" || state === "failed",
        )
        const target = random.pick(candidates)
        const garbage = random.pick(GARBAGE) ?? ""
        if (target) {
          const [operationId, state] = target
          const prefix = state === "pending" ? lane.pendingPrefix : lane.failedPrefix
          // why: corruption models a codec change, not a crash, so it bypasses fault injection.
          disk.set(`${prefix}${operationId}`, garbage)
          ledger.set(operationId, "quarantined")
        }
      } else if (repo.extra) {
        const settled = [
          ...pending.map((action) => [lane.operationId(action), "pending"] as const),
          ...failed.map((failure) => [lane.failedOperationId(failure), "failed"] as const),
        ]
        if (repo.extra.settlesAll)
          for (const [operationId, state] of settled) inFlight(operationId, state, "gone")
        repo.extra.run(random, pending)
        if (repo.extra.settlesAll)
          for (const [operationId] of settled) ledger.set(operationId, "gone")
      }
      uncertain = new Map()
    } catch (error) {
      if (!isFault(error)) throw error
      if (storage.dead) storage = new FaultyStorage(disk)
      repo = lane.open(storage, options.build)
      check()
    }
  }
  check()
  return {
    writes: storage.writes,
    violations,
    checks,
    provenanceKnown: provenance.known,
    liveRecords: provenance.live,
  }
}

interface Tab {
  repo: LaneRepo
  pending: unknown[]
  failed: unknown[]
}

/**
 * why: two web tabs over one localStorage-like store. Each tab acts on its own possibly stale view;
 * the server answers every operation the same way whichever tab sends it.
 */
export function runTwoTabs(
  lane: Lane,
  options: { seed: number; steps: number; design: Design },
): SequenceResult {
  const random = seededRandom(options.seed)
  const disk = new MemoryStorage()
  const ledger = new Map<string, OpState>()
  const accepts = new Map<string, boolean>()
  const violations: Violation[] = []
  let checks = 0
  let clock = 1_700_000_000_000
  let provenance = { known: 0, live: 0 }
  const refresh = (tab: Tab) => {
    tab.pending = tab.repo.pending()
    tab.failed = tab.repo.failed()
  }
  const tabs: Tab[] = [0, 1].map(() => ({ repo: lane.open(disk), pending: [], failed: [] }))
  tabs.forEach(refresh)
  const check = () => {
    const result = verify(lane, ledger, new Map(), disk, options.design)
    violations.push(...result.violations)
    provenance = { known: result.observation.provenanceKnown, live: result.observation.liveRecords }
    checks += 1
  }
  for (let step = 0; step < options.steps; step += 1) {
    clock += 1_000
    const tab = tabs[random.int(tabs.length)] ?? tabs[0]
    const roll = random.int(100)
    if (roll < 35) {
      const action = lane.makeAction(random, clock, FAKE_IDS)
      const operationId = lane.operationId(action)
      accepts.set(operationId, random.next() < 0.75)
      if (tab.repo.enqueue(action, tab.pending)) {
        ledger.set(operationId, "pending")
        tab.pending.push(action)
      }
    } else if (roll < 65) {
      const target = random.pick(tab.pending)
      if (!target) continue
      const operationId = lane.operationId(target)
      tab.repo.attempt(operationId, clock)
      if (accepts.get(operationId)) {
        tab.repo.ack(operationId)
        ledger.set(operationId, "gone")
      } else if (
        tab.repo.fail(target, "stress rejection", clock, tab.failed, tab.pending) &&
        ledger.get(operationId) === "pending"
      )
        ledger.set(operationId, "failed")
      refresh(tab)
    } else if (roll < 75) {
      const target = random.pick(tab.failed)
      if (!target) continue
      const operationId = lane.failedOperationId(target)
      tab.repo.dismiss(operationId)
      ledger.set(operationId, "gone")
      refresh(tab)
    } else if (roll < 95) refresh(tab)
    else check()
  }
  check()
  return {
    writes: 0,
    violations,
    checks,
    provenanceKnown: provenance.known,
    liveRecords: provenance.live,
  }
}
