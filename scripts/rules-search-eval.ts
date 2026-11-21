import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { parseArgs } from "node:util"

import {
  findRules,
  phrasingsOf,
  ruleReferences,
  searchRules,
  type ComprehensiveRules,
  type RuleSearchResult,
} from "../src/features/rules/comprehensiveRules"
import { GAME_RULES, type TextRules } from "../src/features/rules/rulesCatalog"

type Source = "app" | "web" | "written"
type Case = {
  query: string
  rules: (string | string[])[]
  source: Source
  url?: string
  asked?: string
}

// why: nobody tunes search against the held-out cases, so their score shows whether a change helps questions it never saw. Reading them to fix a miss turns them into practice cases.
const SETS = { practice: "", heldout: ".heldout" }
type CaseSet = keyof typeof SETS
const FLOOR = { mtg: { practice: 423, heldout: 127 }, fab: { practice: 72, heldout: 23 } }
type System = keyof typeof FLOOR
const P95_BUDGET_MS = 10
const TOP = 3
const CACHE_HOURS = 12

const { values } = parseArgs({
  options: {
    misses: { type: "boolean", default: false },
    system: { type: "string" },
    cases: { type: "string" },
    record: { type: "string" },
    against: { type: "string" },
  },
})
const before: Record<string, string[]> = values.against
  ? JSON.parse(readFileSync(values.against, "utf8"))
  : {}
const answered: Record<string, string[]> = {}

async function rulesText(source: TextRules) {
  const dir = path.join(tmpdir(), "scryve-rules-search-eval")
  const file = path.join(dir, encodeURIComponent(source.url))
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_HOURS * 3_600_000)
    return readFileSync(file, "utf8")
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`${source.url} answered ${response.status}`)
  const text = await response.text()
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, text)
  return text
}

function screenOpenedBy(rules: ComprehensiveRules, source: TextRules, result: RuleSearchResult) {
  const id =
    result.kind === "rule"
      ? result.rule.id
      : ruleReferences(result.entry.text, source.references).find(
          (part) => typeof part !== "string",
        )?.id
  return new Set(id ? (findRules(rules, id)?.rules.map((rule) => rule.id) ?? []) : [])
}

function rankOf(screens: Set<string>[], wanted: Case["rules"]) {
  const ranks = wanted.map((answer) =>
    screens.findIndex((screen) => [answer].flat().some((id) => screen.has(id))),
  )
  return ranks.includes(-1) ? -1 : Math.max(...ranks)
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

function percent(count: number, total: number) {
  return `${count}/${total} (${total ? Math.round((count / total) * 100) : 0}%)`
}

function lengthOf(query: string) {
  const count = query.trim().split(/\s+/).length
  return count <= 2 ? "1-2 words" : count <= 4 ? "3-4 words" : "5+ words"
}

function evaluate(
  system: System,
  set: CaseSet,
  file: string,
  source: TextRules,
  rules: ComprehensiveRules,
) {
  const cases: Case[] = JSON.parse(readFileSync(file, "utf8"))
  const problems: string[] = []
  const seen = new Set<string>()
  for (const [at, { query, rules: wanted }] of cases.entries()) {
    const key = query.trim().toLowerCase()
    const named = set === "heldout" ? `case ${at + 1}` : `"${query}"`
    if (seen.has(key)) problems.push(`${named} repeats an earlier query`)
    seen.add(key)
    for (const id of wanted.flat())
      if (!findRules(rules, id)?.rules.some((rule) => rule.id === id))
        problems.push(`${named} names ${id}, which is not a rule in ${source.url}`)
  }
  for (const id of phrasingsOf(rules).keys())
    if (!findRules(rules, id)?.rules.some((rule) => rule.id === id))
      problems.push(`phrasings name ${id}, which is not a rule in ${source.url}`)
  const phrased = new Set(
    Object.values(rules.phrasings ?? {})
      .flat()
      .map((phrase) => phrase.trim().toLowerCase()),
  )

  const timings: number[] = []
  const groups = new Map<string, { passed: number; total: number }>()
  const hits: string[] = []
  const misses: string[] = []
  const answers = { one: { passed: 0, total: 0 }, several: { passed: 0, total: 0 } }
  let passed = 0
  let inTop = 0
  let empty = 0
  const copied = { passed: 0, total: 0 }
  for (const entry of cases) {
    let results: RuleSearchResult[] = []
    let fastest = Infinity
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      results = searchRules(rules, entry.query)
      fastest = Math.min(fastest, performance.now() - start)
    }
    timings.push(fastest)
    const screens = results.map((result) => screenOpenedBy(rules, source, result))
    const rank = rankOf(screens, entry.rules)
    const hit = rank >= 0 && rank < entry.rules.length
    for (const group of [entry.source, lengthOf(entry.query)]) {
      const tally = groups.get(group) ?? { passed: 0, total: 0 }
      groups.set(group, { passed: tally.passed + (hit ? 1 : 0), total: tally.total + 1 })
    }
    const tally = answers[entry.rules.length > 1 ? "several" : "one"]
    tally.total++
    if (hit) {
      passed++
      tally.passed++
      hits.push(entry.query)
    }
    if (rank >= 0 && rank < TOP) inTop++
    if (results.length === 0) empty++
    if (phrased.has(entry.query.trim().toLowerCase())) {
      copied.total++
      if (hit) copied.passed++
    }
    if (!hit) {
      const got = results
        .slice(0, 3)
        .map((result) => (result.kind === "rule" ? result.rule.id : `"${result.entry.term}"`))
      misses.push(
        `  ${entry.query} → ${entry.rules.map((answer) => [answer].flat().join("|")).join(" + ")}  got ${got.length ? got.join(", ") : "nothing"}${rank >= 0 ? ` (#${rank + 1})` : ""}`,
      )
    }
  }

  const sorted = timings.toSorted((a, b) => a - b)
  const p95 = percentile(sorted, 0.95)
  console.log(
    `${system} ${set}: ${cases.length} cases · first ${percent(passed, cases.length)} · one-rule cases ${percent(answers.one.passed, answers.one.total)} · several-rule cases ${percent(answers.several.passed, answers.several.total)} · top ${TOP} ${percent(inTop, cases.length)} · no results ${empty} · p50 ${percentile(sorted, 0.5).toFixed(2)}ms p95 ${p95.toFixed(2)}ms`,
  )
  console.log(
    `  ${[...groups].map(([name, tally]) => `${name} ${percent(tally.passed, tally.total)}`).join(" · ")}${copied.total ? ` · same as a shipped phrasing ${percent(copied.passed, copied.total)}` : ""}`,
  )
  const key = `${system} ${set}`
  answered[key] = hits
  if (before[key]) {
    const was = new Set(before[key])
    const now = new Set(hits)
    const lost = before[key].filter((query) => !now.has(query))
    console.log(
      `  against ${values.against}: gained ${hits.filter((query) => !was.has(query)).length} · lost ${lost.length}`,
    )
    if (set === "practice") for (const query of lost) console.log(`  lost: ${query}`)
  }
  if (values.misses && set === "practice") console.log(misses.join("\n"))
  if (!values.cases && passed < FLOOR[system][set])
    problems.push(`answered ${passed}, below the floor of ${FLOOR[system][set]}`)
  if (p95 > P95_BUDGET_MS) problems.push(`p95 ${p95.toFixed(2)}ms is over ${P95_BUDGET_MS}ms`)
  for (const problem of problems) console.log(`  fail: ${problem}`)
  return problems.length === 0
}

async function main() {
  if (values.cases && !values.system) throw new Error("--cases needs --system")
  if (values.system && !(values.system in FLOOR))
    throw new Error(`--system is one of ${Object.keys(FLOOR).join(", ")}`)
  const systems = (Object.keys(FLOOR) as System[]).filter(
    (system) => !values.system || values.system === system,
  )
  let ok = true
  for (const system of systems) {
    const source = GAME_RULES[system]
    const rules = source.parse(await rulesText(source))
    if (!rules) throw new Error(`${system}: the downloaded rules no longer parse`)
    const sets = (Object.keys(SETS) as CaseSet[]).filter(
      (set) => !values.cases || set === "practice",
    )
    for (const set of sets) {
      const file =
        values.cases ?? path.join(__dirname, "rules-search", `${system}${SETS[set]}.json`)
      ok = evaluate(system, set, file, source, rules) && ok
    }
  }
  if (values.record) writeFileSync(values.record, JSON.stringify(answered))
  if (!ok) process.exitCode = 1
}

void main()
