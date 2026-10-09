import { writeFileSync } from "node:fs"

/** why: pass/fail are invariant checks; warn is a cost worth knowing that breaks nothing today; na means the design has nothing to check. */
export interface Row {
  scenario: string
  check: string
  pass: number
  fail: number
  warn: number
  na: number
  metric?: string
  /** why: gated rows fail the Jest run; ungated rows only score a design (report richness, recovery). */
  gate: boolean
  examples: string[]
}

const rows = new Map<string, Row>()

export function row(scenario: string, check: string, gate = true): Row {
  const key = `${scenario}\u0000${check}`
  const existing = rows.get(key)
  if (existing) return existing
  const created: Row = { scenario, check, gate, pass: 0, fail: 0, warn: 0, na: 0, examples: [] }
  rows.set(key, created)
  return created
}

export function record(
  scenario: string,
  check: string,
  outcome: "pass" | "fail" | "warn" | "na",
  example?: string,
  gate = true,
) {
  const target = row(scenario, check, gate)
  target[outcome] += 1
  if (example && outcome !== "pass" && target.examples.length < 3) target.examples.push(example)
}

export const score = (
  scenario: string,
  check: string,
  outcome: "pass" | "fail" | "warn" | "na",
  example?: string,
) => record(scenario, check, outcome, example, false)

export function metric(scenario: string, check: string, value: string) {
  row(scenario, check).metric = value
}

export const failuresIn = (scenario: string) =>
  [...rows.values()]
    .filter((candidate) => candidate.scenario === scenario && candidate.gate && candidate.fail > 0)
    .map((candidate) => `${candidate.check}: ${candidate.examples.join(" | ")}`)

const pad = (value: string, width: number) => value.padEnd(width)

export function printScorecard(label: string) {
  const all = [...rows.values()]
  const widths = {
    scenario: Math.max(8, ...all.map((entry) => entry.scenario.length)),
    check: Math.max(5, ...all.map((entry) => entry.check.length)),
  }
  const lines = [
    `\nOutbox stress scorecard: ${label}`,
    "kind: gate = invariant, fails the run; score = design quality, reported only",
    `${pad("scenario", widths.scenario)}  ${pad("check", widths.check)}  kind   ${"pass".padStart(6)} ${"fail".padStart(5)} ${"warn".padStart(5)} ${"n/a".padStart(5)}  metric`,
  ]
  for (const entry of all)
    lines.push(
      `${pad(entry.scenario, widths.scenario)}  ${pad(entry.check, widths.check)}  ${entry.gate ? "gate " : "score"}  ${String(entry.pass).padStart(6)} ${String(entry.fail).padStart(5)} ${String(entry.warn).padStart(5)} ${String(entry.na).padStart(5)}  ${entry.metric ?? ""}`,
    )
  const notes = all.filter(
    (entry) => entry.examples.length && (entry.gate || entry.pass > 0 || entry.warn > 0),
  )
  if (notes.length) lines.push("", "Examples (replay with the seed shown):")
  for (const entry of notes)
    for (const example of entry.examples)
      lines.push(`  [${entry.scenario} / ${entry.check}] ${example}`)
  process.stdout.write(`${lines.join("\n")}\n`)
  const out = process.env.OUTBOX_STRESS_OUT
  if (out) writeFileSync(out, JSON.stringify({ label, rows: all }, null, 2))
}
