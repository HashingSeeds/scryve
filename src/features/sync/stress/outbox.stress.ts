/**
 * why: an opt-in stress harness for the offline outbox kernel and its three adapters. It is slow and
 * exploratory, so it has its own Jest config and never runs in `pnpm test` or CI.
 *
 * Run:      pnpm jest -c src/features/sync/stress/jest.config.js --runInBand
 * Tune:     OUTBOX_STRESS_SEEDS (default 6), OUTBOX_STRESS_STEPS (default 24)
 * Save:     OUTBOX_STRESS_LABEL=name OUTBOX_STRESS_OUT=/tmp/name.json
 * Compare:  node src/features/sync/stress/compare.mjs /tmp/a.json /tmp/b.json
 * Other branch: git checkout <ref> && git checkout <harness branch> -- src/features/sync/stress
 * Old builds: legacy/ pins main and v0.1.1 outbox code; regenerate with
 *           node src/features/sync/stress/legacy/fetch.mjs
 *
 * Scenarios: 0 calibration, 1 storage faults, 2 rollback, 3 forward, 4 Convex validator contract,
 * 5 two web tabs, 6 corruption matrix, 7 recovery drill, 8 cost. Each failure prints its replay seed.
 * `gate` rows fail the run; `score` rows only grade a design.
 */
import { makeFunctionReference } from "convex/server"

import type { DurableStringStorage } from "@/features/sync/durableOutbox"

import { contractClient, makeWorld, type Verdict, verdictFailed, type World } from "./contract"
import {
  CORRUPTIONS,
  corrupt,
  deriveFix,
  type Fix,
  flatShape,
  getPath,
  matchesMaskedRename,
  privateValues,
  reportedShape,
  reportRecords,
  reportStrings,
  showsRename,
  TARGETS,
} from "./corruption"
import {
  configureBuild,
  type Design,
  detectDesign,
  isRecord,
  isSidecarKey,
  namesBuild,
  provenanceOf,
  rawBuildIds,
  safeJson,
  takeReports,
} from "./design"
import { orphanSidecars, quarantinedOperations, type ViolationKind } from "./invariants"
import {
  type BuildName,
  connectedLane,
  FAKE_IDS,
  type Lane,
  type LaneRepo,
  LANES,
  OWNER,
  type ServerIds,
} from "./lanes"
import { recoverQuarantined, recoveryLoc } from "./recovery"
import { failuresIn, metric, printScorecard, record, score } from "./scorecard"
import { runSequence, runTwoTabs } from "./sequence"
import { type FaultMode, MemoryStorage, seededRandom, utf8Bytes } from "./storage"

jest.mock("expo-crypto", () => ({ randomUUID: () => require("node:crypto").randomUUID() }))
jest.mock("@/utils/storage", () => ({ storage: new (require("./storage").MemoryStorage)() }))
// why: these pull React Native UI into Node; the connected sender under test needs none of them.
jest.mock("@/features/game/localPersistence", () => ({ LocalGameRepository: class {} }))
jest.mock("@/utils/analytics", () => ({ captureGame: () => undefined }))
jest.mock("@/utils/storeReview", () => ({ recordReviewCompletion: () => undefined }))
jest.mock("@/features/connected/useConvexOnline", () => ({ useConvexOnline: () => true }))

const BRANCH_BUILD = "stress-branch-build"
const OLD_WRITER = "stress-older-build"
const SEEDS = Number(process.env.OUTBOX_STRESS_SEEDS ?? 6)
const STEPS = Number(process.env.OUTBOX_STRESS_STEPS ?? 24)
const LEGACY_BUILDS: readonly BuildName[] = ["main", "v0.1.1"]
const CLOCK = 1_700_000_000_000
// why: reports may name these exact strings; they are code, not player data.
const OPERATION_TYPES = [
  "life.changed",
  "commanderDamage.submitted",
  "commanderDamage.resolved",
  "cards",
  "create",
  "rename",
  "delete",
]

let design: Design = "none"
let world: World

beforeAll(async () => {
  configureBuild(BRANCH_BUILD)
  const probe = new MemoryStorage()
  for (const lane of LANES) lane.open(probe).enqueue(lane.makeAction(seededRandom(1), 1, FAKE_IDS))
  design = detectDesign(probe)
  takeReports()
  world = await makeWorld()
}, 60_000)

afterAll(() => printScorecard(`${process.env.OUTBOX_STRESS_LABEL ?? "branch"} (design: ${design})`))

const VIOLATION_KINDS: ViolationKind[] = [
  "lost",
  "resurrected",
  "duplicate",
  "wrong-slot",
  "misquarantined",
  "orphan-provenance",
  "limit",
]

const recordKeys = (lane: Lane, storage: MemoryStorage) =>
  storage
    .getAllKeys()
    .filter((key) => key.startsWith(lane.pendingPrefix) || key.startsWith(lane.failedPrefix))

function seedRecords(lane: Lane, repo: LaneRepo, ids: ServerIds, seed: number) {
  const random = seededRandom(seed)
  for (let index = 0; index < 8; index += 1)
    repo.enqueue(lane.makeAction(random, CLOCK + index, ids))
  const queued = repo.pending()
  for (const action of queued.slice(0, 2)) repo.attempt(lane.operationId(action), CLOCK + 100)
  for (const action of queued.slice(5))
    repo.fail(action, "stress rejection", CLOCK + 200, repo.failed(), repo.pending())
  return {
    pending: repo.pending().map((action) => lane.operationId(action)),
    failed: repo.failed().map((failure) => lane.failedOperationId(failure)),
  }
}

function recordVerdicts(
  scenario: string,
  check: string,
  verdicts: readonly Verdict[],
  tag: string,
) {
  for (const verdict of verdicts)
    record(
      scenario,
      check,
      verdictFailed(verdict) ? "fail" : "pass",
      `${tag} ${verdict.name} ${verdict.outcome}: ${verdict.detail ?? ""}`,
    )
  if (!verdicts.length) record(scenario, check, "fail", `${tag} nothing was sent`)
}

/** why: a send that stalls or skips records would otherwise look like a clean contract, so every queued record must reach a validator. */
class NoDeleteStorage extends MemoryStorage {
  delete() {}
}

async function sendAll(lane: Lane, disk: DurableStringStorage, build?: BuildName) {
  const verdicts: Verdict[] = []
  const sent = await lane.send(disk, contractClient(world, verdicts), world.ids, build)
  const reached = sent.queued > 0 && sent.remaining === 0 && verdicts.length === sent.queued
  return { verdicts, sent, reached }
}

async function sendThroughValidators(
  scenario: string,
  lane: Lane,
  disk: MemoryStorage,
  tag: string,
  build?: BuildName,
) {
  const { verdicts, sent, reached } = await sendAll(lane, disk, build)
  record(
    scenario,
    `${lane.name}: every queued record reached a validator`,
    reached ? "pass" : "fail",
    `${tag} queued ${sent.queued}, validated ${verdicts.length}, left pending ${sent.remaining}`,
  )
  if (lane.name === "connected")
    score(
      scenario,
      `${lane.name}: sent by the app's own sender`,
      build ? "na" : sent.sender === "app" ? "pass" : "warn",
      `${tag} used the harness ${sent.sender}`,
    )
  return verdicts
}

// why: deck send paths refuse to send past an unresolved failure for the same deck or version, so the user resolves them first.
function dismissAll(lane: Lane, disk: MemoryStorage, build?: BuildName) {
  const repo = lane.open(disk, build)
  for (const failure of repo.failed()) repo.dismiss(lane.failedOperationId(failure))
}

function corruptibleAction(lane: Lane, seed: number, ids: ServerIds) {
  const target = TARGETS[lane.name]
  const paths = [target.rename[0], target.retype, target.missing, target.huge]
  for (let attempt = seed; ; attempt += 1) {
    const action = lane.makeAction(seededRandom(attempt), CLOCK, ids)
    if (paths.every((path) => getPath(action, path) !== undefined)) return action
  }
}

const withoutProvenance = (value: unknown) => {
  if (!isRecord(value)) return value
  const { writtenBy: _writtenBy, ...rest } = value
  return rest
}

describe("outbox stress", () => {
  it("0 calibration: the harness catches a build that deletes unreadable records", () => {
    const scenario = "0 calibration"
    let lost = 0
    for (const seed of [1000, 1001, 1002, 1003])
      lost += runSequence(LANES[0], {
        seed,
        steps: STEPS,
        design,
        build: "main",
      }).violations.filter((violation) => violation.kind === "lost").length
    record(
      scenario,
      "main build loses corrupt records",
      lost ? "pass" : "fail",
      "harness saw no loss",
    )
    metric(scenario, "main build loses corrupt records", `${lost} losses detected`)
    expect(failuresIn(scenario)).toEqual([])
  })

  it("0 calibration: the contract client fails what it should", async () => {
    const scenario = "0 calibration"
    const verdicts: Verdict[] = []
    const client = contractClient(world, verdicts)
    const life = {
      publicId: world.ids.publicId,
      playerId: world.ids.playerIds[0],
      operationId: "calibration-operation-01",
      delta: 1,
      deviceId: "device-host-0001",
      clientCreatedAt: CLOCK,
    }
    const probes = [
      ["missing function", "games:doesNotExist", life, "error"],
      ["extra field", "games:changeLife", { ...life, writtenBy: "90.0.0" }, "rejected"],
      [
        "wrong type quoting a handler path",
        "games:changeLife",
        { ...life, delta: "/convex/games.ts:1" },
        "rejected",
      ],
      ["wrong type on decks.create", "decks:create", { name: 1, format: "commander" }, "rejected"],
      [
        "wrong nested card type",
        "decks:syncCreateVersion",
        {
          deckId: world.ids.deckId,
          operationId: "calibration-operation-02",
          name: "Version",
          cards: [{ name: 5, quantity: 1 }],
        },
        "rejected",
      ],
      [
        "domain rule",
        "games:changeLife",
        { ...life, publicId: "no-such-game-public-id" },
        "business",
      ],
    ] as const
    for (const [label, name, args, expected] of probes) {
      await client.mutation(makeFunctionReference<"mutation">(name), args).catch(() => undefined)
      const outcome = verdicts.at(-1)?.outcome
      record(
        scenario,
        `contract client: ${label} is ${expected}`,
        outcome === expected ? "pass" : "fail",
        `${name} came back ${outcome}`,
      )
    }

    // why: a sender that never acknowledges must trip the pending-record gate, or that gate proves nothing.
    const stuck = new NoDeleteStorage()
    connectedLane.open(stuck).enqueue(connectedLane.makeAction(seededRandom(1), CLOCK, world.ids))
    const { reached } = await sendAll(connectedLane, stuck)
    record(
      scenario,
      "pending gate fails a no-op acknowledgement",
      reached ? "fail" : "pass",
      "gate passed with the record still pending",
    )
    expect(failuresIn(scenario)).toEqual([])
  })

  it("1 fault-injecting storage", () => {
    const scenario = "1 faults"
    for (const lane of LANES) {
      let runs = 0
      let known = 0
      let live = 0
      const started = performance.now()
      const plans = [
        ...Array.from({ length: SEEDS }, (_, index) => ({ seed: 1000 + index, fill: false })),
        { seed: 9000, fill: true },
      ]
      for (const { seed, fill } of plans) {
        const steps = fill ? lane.limits.maxPendingRecords + 4 : STEPS
        const dry = runSequence(lane, { seed, steps, design, fill })
        const stride = fill ? Math.max(1, Math.floor(dry.writes / 16)) : 1
        const faults: Array<{ mode: FaultMode; atWrite: number } | undefined> = [undefined]
        for (let atWrite = 0; atWrite < dry.writes; atWrite += stride)
          for (const mode of ["kill", "throw"] as const) faults.push({ mode, atWrite })
        for (const fault of faults) {
          const result = runSequence(lane, { seed, steps, design, fault, fill })
          runs += 1
          known += result.provenanceKnown
          live += result.liveRecords
          const label = `seed=${seed}${fill ? " fill" : ""} fault=${fault ? `${fault.mode}@${fault.atWrite}` : "none"}`
          for (const kind of VIOLATION_KINDS) {
            const found = result.violations.find((violation) => violation.kind === kind)
            const check = `${lane.name}: ${kind}`
            if (kind === "orphan-provenance" && design !== "sidecar") record(scenario, check, "na")
            else if (found) record(scenario, check, "fail", `${label} ${found.detail}`)
            else record(scenario, check, "pass")
          }
        }
      }
      takeReports()
      metric(
        scenario,
        `${lane.name}: lost`,
        `${runs} runs, ${Math.round(performance.now() - started)} ms`,
      )
      metric(
        scenario,
        `${lane.name}: orphan-provenance`,
        design === "none"
          ? "no provenance"
          : `provenance on ${live ? Math.round((known / live) * 100) : 0}% of surviving records`,
      )
    }
    expect(failuresIn(scenario)).toEqual([])
  })

  it("2 rollback: branch writes, old build reads and sends", async () => {
    const scenario = "2 rollback"
    for (const build of LEGACY_BUILDS)
      for (const [index, lane] of LANES.entries()) {
        const tag = `${lane.name} -> ${build}`
        configureBuild(BRANCH_BUILD)
        const disk = new MemoryStorage()
        const written = seedRecords(lane, lane.open(disk), world.ids, 2000 + index)
        const before = recordKeys(lane, disk)
        const old = lane.open(disk, build)
        const loadedPending = old.pending().map((action) => lane.operationId(action))
        const loadedFailed = old.failed().map((failure) => lane.failedOperationId(failure))
        const missing = [
          ...written.pending.filter((id) => !loadedPending.includes(id)),
          ...written.failed.filter((id) => !loadedFailed.includes(id)),
        ]
        record(
          scenario,
          `${lane.name}: old build loads every record`,
          missing.length ? "fail" : "pass",
          `${tag} dropped ${missing.join(",")}`,
        )
        const deleted = before.filter((key) => disk.getString(key) === undefined)
        record(
          scenario,
          `${lane.name}: old build deletes nothing`,
          deleted.length ? "fail" : "pass",
          `${tag} deleted ${deleted[0]}`,
        )

        const oldPending = old.pending()
        for (const action of oldPending) old.attempt(lane.operationId(action), CLOCK + 300)
        const [rejected] = oldPending
        if (rejected)
          old.fail(rejected, "old build rejection", CLOCK + 400, old.failed(), old.pending())
        const rewritten = [
          ...oldPending
            .slice(1)
            .map((action) => `${lane.pendingPrefix}${lane.operationId(action)}`),
          ...(rejected ? [`${lane.failedPrefix}${lane.operationId(rejected)}`] : []),
        ]
        for (const key of rewritten) {
          const check = `${lane.name}: provenance after old build rewrites`
          if (design === "none") record(scenario, check, "na")
          else if (provenanceOf(disk, key) === BRANCH_BUILD)
            record(scenario, check, "warn", `${tag} ${key.slice(-36)} still claims ${BRANCH_BUILD}`)
          else record(scenario, check, "pass")
        }

        dismissAll(lane, disk, build)
        const verdicts = await sendThroughValidators(scenario, lane, disk, tag, build)
        recordVerdicts(scenario, `${lane.name}: old send args pass validators`, verdicts, tag)

        const orphans = orphanSidecars(disk)
        const orphanCheck = `${lane.name}: old build leaves no orphan provenance`
        if (design !== "sidecar") record(scenario, orphanCheck, "na")
        else
          record(
            scenario,
            orphanCheck,
            orphans.length ? "warn" : "pass",
            `${tag} ${orphans.length} orphan sidecars, e.g. ${orphans[0]?.slice(0, 60)}`,
          )

        takeReports()
        const again = lane.open(disk)
        again.pending()
        again.failed()
        const reports = takeReports()
        record(
          scenario,
          `${lane.name}: branch reloads after rollback cleanly`,
          reports.length ? "fail" : "pass",
          `${tag} quarantined ${String(JSON.stringify(reports[0])).slice(0, 120)}`,
        )
      }
    expect(failuresIn(scenario)).toEqual([])
  })

  it("3 forward: old build writes, branch reads", async () => {
    const scenario = "3 forward"
    for (const build of LEGACY_BUILDS)
      for (const [index, lane] of LANES.entries()) {
        const tag = `${build} -> ${lane.name}`
        configureBuild(BRANCH_BUILD)
        const disk = new MemoryStorage()
        const written = seedRecords(lane, lane.open(disk, build), world.ids, 3000 + index)
        takeReports()
        const branch = lane.open(disk)
        const pending = branch.pending().map((action) => lane.operationId(action))
        const failed = branch.failed().map((failure) => lane.failedOperationId(failure))
        const missing = [
          ...written.pending.filter((id) => !pending.includes(id)),
          ...written.failed.filter((id) => !failed.includes(id)),
        ]
        const reports = takeReports()
        record(
          scenario,
          `${lane.name}: branch loads every old record`,
          missing.length || reports.length ? "fail" : "pass",
          `${tag} missing ${missing.join(",")} reports ${reports.length}`,
        )
        for (const key of recordKeys(lane, disk)) {
          const check = `${lane.name}: old records don't claim the branch build`
          if (design === "none") record(scenario, check, "na")
          else
            record(
              scenario,
              check,
              provenanceOf(disk, key) === BRANCH_BUILD ? "fail" : "pass",
              `${tag} ${key}`,
            )
        }

        const [victim] = written.pending
        const victimKey = `${lane.pendingPrefix}${victim}`
        disk.set(victimKey, (disk.getString(victimKey) ?? "").slice(0, 20))
        lane.open(disk).pending()
        const [report] = takeReports()
        const quarantined = victim !== undefined && quarantinedOperations(lane, disk).has(victim)
        record(
          scenario,
          `${lane.name}: quarantine still works on old records`,
          quarantined && report ? "pass" : "fail",
          `${tag} quarantined=${quarantined} report=${Boolean(report)}`,
        )
        const reportedWriter = report ? reportRecords(report)[0]?.writtenBy : undefined
        const writerCheck = `${lane.name}: report doesn't credit the branch for an old record`
        if (design === "none") score(scenario, writerCheck, "na")
        else
          score(
            scenario,
            writerCheck,
            namesBuild(reportedWriter, BRANCH_BUILD) ? "fail" : "pass",
            `${tag} writtenBy=${JSON.stringify(reportedWriter)}`,
          )

        dismissAll(lane, disk)
        const verdicts = await sendThroughValidators(scenario, lane, disk, tag)
        recordVerdicts(
          scenario,
          `${lane.name}: branch sends old records with valid args`,
          verdicts,
          tag,
        )
      }
    expect(failuresIn(scenario)).toEqual([])
  })

  it("4 server contract: records with provenance through the real send code", async () => {
    const scenario = "4 contract"
    for (const [index, lane] of LANES.entries()) {
      configureBuild(BRANCH_BUILD)
      const disk = new MemoryStorage()
      const repo = lane.open(disk)
      const random = seededRandom(4000 + index)
      for (let count = 0; count < 16; count += 1)
        repo.enqueue(lane.makeAction(random, CLOCK + count, world.ids))
      for (const action of repo.pending().slice(0, 4))
        repo.attempt(lane.operationId(action), CLOCK + 50)
      const keys = recordKeys(lane, disk)
      const carrying = keys.filter((key) => provenanceOf(disk, key) === BRANCH_BUILD).length
      const verdicts = await sendThroughValidators(scenario, lane, disk, lane.name)
      for (const verdict of verdicts)
        record(
          scenario,
          `${lane.name} -> ${verdict.name}`,
          verdictFailed(verdict) ? "fail" : "pass",
          `${verdict.outcome}: ${verdict.detail ?? ""}`,
        )
      if (!verdicts.length)
        record(scenario, `${lane.name}: anything sent`, "fail", "nothing was sent")
      const accepted = verdicts.filter((verdict) => verdict.outcome === "accepted").length
      const names = [...new Set(verdicts.map((verdict) => verdict.name))]
      for (const name of names)
        metric(
          scenario,
          `${lane.name} -> ${name}`,
          `${carrying}/${keys.length} records carried provenance; ${accepted} ran, ${verdicts.length - accepted} hit domain rules`,
        )
    }
    expect(failuresIn(scenario)).toEqual([])
  })

  // why: a stale tab still resends an operation another tab settled until https://github.com/HashingSeeds/scryve/pull/369 is in this stack; flip to `it` then.
  it.failing("5 two web tabs sharing one store", () => {
    const scenario = "5 two tabs"
    for (const lane of LANES) {
      for (let seed = 5000; seed < 5000 + SEEDS * 40; seed += 1) {
        const result = runTwoTabs(lane, { seed, steps: STEPS * 2, design })
        for (const kind of VIOLATION_KINDS) {
          const found = result.violations.find((violation) => violation.kind === kind)
          const check = `${lane.name}: ${kind}`
          if (kind === "orphan-provenance" && design !== "sidecar") record(scenario, check, "na")
          else if (found) record(scenario, check, "fail", `seed=${seed} ${found.detail}`)
          else record(scenario, check, "pass")
        }
      }
    }
    expect(failuresIn(scenario)).toEqual([])
  })

  it("6 corruption matrix: quarantine reports", () => {
    const scenario = "6 corruption"
    const pinpointed = new Map<string, { yes: number; of: number }>()
    for (const [laneIndex, lane] of LANES.entries())
      for (const slot of ["pending", "failed"] as const)
        for (const [kindIndex, kind] of CORRUPTIONS.entries()) {
          const tag = `${lane.name}/${slot}/${kind}`
          configureBuild(BRANCH_BUILD)
          const disk = new MemoryStorage()
          const repo = lane.open(disk)
          const ids = {
            ...FAKE_IDS,
            playerIds: ["SENTINEL-p1-abcdef12", "SENTINEL-p2-abcdef12"] as [string, string],
          }
          const action = corruptibleAction(lane, 6000 + laneIndex * 100 + kindIndex * 7, ids)
          repo.enqueue(action)
          const operationId = lane.operationId(action)
          if (slot === "failed")
            repo.fail(action, "SENTINEL-reason-abcdef", CLOCK, [], repo.pending())
          const key = `${slot === "pending" ? lane.pendingPrefix : lane.failedPrefix}${operationId}`
          const original = disk.getString(key) ?? ""
          const parsed = withoutProvenance(safeJson(original))
          const secrets = privateValues(
            parsed,
            new Set(["commander", BRANCH_BUILD, "stress rejection", ...OPERATION_TYPES]),
          )
          const prefix = slot === "failed" ? "action." : ""
          const damaged = corrupt(original, kind, lane.name, prefix)
          disk.set(key, damaged)
          takeReports()
          const reader = lane.open(disk)
          reader.pending()
          reader.failed()
          const reports = takeReports()
          const quarantined = quarantinedOperations(lane, disk).has(operationId)
          const tolerable = kind === "extra-field" || kind === "huge-value"
          if (tolerable) {
            score(scenario, `${lane.name}: ${kind} handled`, "pass")
            metric(
              scenario,
              `${lane.name}: ${kind} handled`,
              quarantined ? "quarantined" : "loaded as-is",
            )
          } else
            record(
              scenario,
              `${lane.name}: unreadable record quarantined`,
              quarantined && reports.length ? "pass" : "fail",
              `${tag} quarantined=${quarantined} reports=${reports.length}`,
            )

          // why: a report can leak an id inside a longer string (a storage key, a message), so every identifier is searched as a substring.
          const serialized = reportStrings(reports).join("\n")
          const identifiers = [
            "SENTINEL",
            OWNER,
            FAKE_IDS.publicId,
            operationId,
            key,
            ...secrets,
            ...Object.values(rawBuildIds(BRANCH_BUILD)),
          ]
          const leaks = identifiers.filter((identifier) => serialized.includes(identifier))
          record(
            scenario,
            `${lane.name}: report carries no record values`,
            leaks.length ? "fail" : "pass",
            `${tag} leaked ${leaks[0]?.slice(0, 60)}`,
          )
          if (tolerable && !quarantined) continue

          const entry = reports.flatMap(reportRecords)[0]
          const has = (field: string, ok: boolean) =>
            score(
              scenario,
              `${lane.name}: report has ${field}`,
              entry && ok ? "pass" : "fail",
              `${tag} ${field}=${JSON.stringify(entry?.[field])?.slice(0, 60)}`,
            )
          has("slot", entry?.slot === slot)
          has("bytes", entry?.bytes === utf8Bytes(damaged))
          if (kind !== "truncated" && kind !== "empty") has("shape", isRecord(entry?.shape))
          has("writtenBy", namesBuild(entry?.writtenBy, BRANCH_BUILD))
          const writer = entry?.writtenBy
          if (isRecord(writer))
            has(
              "build digests",
              [writer.update, writer.runtime, writer.commit].every(
                (part) => typeof part === "string" && /^[\da-f]{8}$/.test(part),
              ),
            )

          if (kind === "renamed" || kind === "retyped" || kind === "missing-nested") {
            const reported = reportedShape(entry?.shape)
            const target = TARGETS[lane.name]
            const found =
              kind === "renamed"
                ? showsRename(reported, prefix + target.rename[0], prefix + target.rename[1])
                : kind === "retyped"
                  ? reported.get(prefix + target.retype) === "string"
                  : [...flatShape(parsed).keys()].includes(prefix + target.missing) &&
                    !reported.has(prefix + target.missing) &&
                    reported.size > 0
            const bucket = pinpointed.get(lane.name) ?? { yes: 0, of: 0 }
            pinpointed.set(lane.name, { yes: bucket.yes + Number(found), of: bucket.of + 1 })
            score(
              scenario,
              `${lane.name}: report pinpoints the codec change`,
              found ? "pass" : "fail",
              `${tag}`,
            )
          }
        }
    for (const [name, { yes, of }] of pinpointed)
      metric(
        scenario,
        `${name}: report pinpoints the codec change`,
        `${yes}/${of} renamed/retyped/missing cases`,
      )
    expect(failuresIn(scenario)).toEqual([])
  })

  it("7 recovery drill: repair renamed and retyped records from the report alone", async () => {
    const scenario = "7 recovery"
    const designLoc = recoveryLoc(design) - recoveryLoc("core")
    for (const [laneIndex, lane] of LANES.entries())
      for (const kind of ["renamed", "retyped"] as const) {
        const tag = `${lane.name}/${kind}`
        configureBuild(OLD_WRITER)
        const disk = new MemoryStorage()
        const action = corruptibleAction(lane, 7000 + laneIndex * 10, world.ids)
        lane.open(disk).enqueue(action)
        configureBuild(BRANCH_BUILD)
        const operationId = lane.operationId(action)
        const key = `${lane.pendingPrefix}${operationId}`
        const original = disk.getString(key) ?? ""
        const expected = flatShape(withoutProvenance(safeJson(original)))
        disk.set(key, corrupt(original, kind, lane.name, ""))
        takeReports()
        lane.open(disk).pending()
        const entry = takeReports().flatMap(reportRecords)[0]
        const target = TARGETS[lane.name]
        const truth: Fix =
          kind === "renamed"
            ? { kind: "rename", from: target.rename[1], to: target.rename[0] }
            : { kind: "retype", path: target.retype, to: "number" }
        const derived = deriveFix(reportedShape(entry?.shape), expected)
        const masked = matchesMaskedRename(derived, truth)
        const exact = JSON.stringify(derived) === JSON.stringify(truth) || masked
        score(
          scenario,
          `${lane.name}: fix derivable from report`,
          exact ? "pass" : "fail",
          `${tag} derived ${JSON.stringify(derived)}`,
        )
        // why: a masked new name is read from the writer's commit, which is what `truth` stands in for.
        const fix = derived && exact && !masked ? derived : truth

        const requeueInto = (storage: MemoryStorage) => (repaired: Record<string, unknown>) =>
          lane.open(storage).enqueue(repaired)
        const minimal = disk.clone()
        recoverQuarantined(minimal, lane.pendingPrefix, fix, requeueInto(minimal), "core")
        const minimalIssues = [
          ...orphanSidecars(minimal).map((orphan) => `orphan ${orphan.slice(0, 40)}`),
          ...(design !== "none" && provenanceOf(minimal, key) !== BRANCH_BUILD
            ? [`provenance ${provenanceOf(minimal, key)}`]
            : []),
        ]

        const recovered = recoverQuarantined(
          disk,
          lane.pendingPrefix,
          fix,
          requeueInto(disk),
          design,
        )
        const requeued = lane
          .open(disk)
          .pending()
          .some((candidate) => lane.operationId(candidate) === operationId)
        record(
          scenario,
          `${lane.name}: recovered record re-queues`,
          recovered === 1 && requeued ? "pass" : "fail",
          `${tag} recovered=${recovered} requeued=${requeued}`,
        )
        const leftovers = disk
          .getAllKeys()
          .filter(
            (candidate) =>
              candidate.includes(operationId) &&
              (candidate.startsWith("quarantine:") ||
                (isSidecarKey(candidate) && candidate.includes("quarantine:"))),
          )
        score(
          scenario,
          `${lane.name}: recovery leaves nothing behind`,
          leftovers.length || orphanSidecars(disk).length ? "fail" : "pass",
          `${tag} ${leftovers[0]}`,
        )
        const provenanceCheck = `${lane.name}: recovered record names the recovering build`
        if (design === "none") score(scenario, provenanceCheck, "na")
        else
          score(
            scenario,
            provenanceCheck,
            provenanceOf(disk, key) === BRANCH_BUILD ? "pass" : "fail",
            `${tag} ${provenanceOf(disk, key)}`,
          )

        const verdicts = await sendThroughValidators(scenario, lane, disk, tag)
        recordVerdicts(
          scenario,
          `${lane.name}: recovered record sends with valid args`,
          verdicts,
          tag,
        )
        const loc = recoveryLoc("core") + (minimalIssues.length ? designLoc : 0)
        score(scenario, `${lane.name}: recovery LOC`, "pass")
        metric(
          scenario,
          `${lane.name}: recovery LOC`,
          `${loc} lines (core ${recoveryLoc("core")}${minimalIssues.length ? ` + ${design} ${designLoc}: ${minimalIssues[0]}` : ""})`,
        )
      }
    expect(failuresIn(scenario)).toEqual([])
  })

  it("8 cost: storage per 100 records and load time for 500", () => {
    const scenario = "8 cost"
    for (const [index, lane] of LANES.entries()) {
      configureBuild(BRANCH_BUILD)
      const disk = new MemoryStorage()
      const repo = lane.open(disk)
      const random = seededRandom(8000 + index)
      for (let count = 0; count < 100; count += 1)
        repo.enqueue(lane.makeAction(random, CLOCK + count, FAKE_IDS))
      const sidecarBytes = disk.totalBytes(isSidecarKey)
      const inlineBytes = recordKeys(lane, disk).reduce((total, key) => {
        const value = disk.getString(key) ?? ""
        return (
          total + utf8Bytes(value) - utf8Bytes(JSON.stringify(withoutProvenance(safeJson(value))))
        )
      }, 0)
      score(scenario, `${lane.name}: 100 records`, "pass")
      metric(
        scenario,
        `${lane.name}: 100 records`,
        `${disk.getAllKeys().length} keys, ${(disk.totalBytes() / 1024).toFixed(1)} KB, provenance ${((sidecarBytes + inlineBytes) / 1024).toFixed(1)} KB`,
      )

      const large = new MemoryStorage()
      const writer = lane.open(large)
      for (let count = 0; count < 500; count += 1)
        writer.enqueue(lane.makeAction(random, CLOCK + count, FAKE_IDS), [])
      const timings: number[] = []
      let loaded = 0
      for (let run = 0; run < 5; run += 1) {
        const started = performance.now()
        loaded = lane.open(large).pending().length
        timings.push(performance.now() - started)
      }
      timings.sort((left, right) => left - right)
      record(
        scenario,
        `${lane.name}: load 500`,
        loaded === 500 ? "pass" : "fail",
        `loaded ${loaded}`,
      )
      metric(
        scenario,
        `${lane.name}: load 500`,
        `${(timings[2] ?? 0).toFixed(1)} ms median of 5, ${large.getAllKeys().length} keys`,
      )
    }
    expect(failuresIn(scenario)).toEqual([])
  })
})
