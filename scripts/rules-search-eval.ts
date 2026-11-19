/** why: grades the screen a result opens, not the result's id, since that screen is what a player at the table reads. An answer can list rules that say the same thing in two places (104.3b, 704.5a) so either counts. */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { parseArgs } from "node:util"

import {
  findRules,
  ruleReferences,
  searchRules,
  type ComprehensiveRules,
  type RuleSearchResult,
} from "../src/features/rules/comprehensiveRules"
import { GAME_RULES, type TextRules } from "../src/features/rules/rulesCatalog"

/** why: analytics keeps a search's text only when it found nothing, so `app` cases are copied from those `rules_search` events; they are the only proof of what players really type. */
type Source = "app" | "web" | "written"
type Case = {
  query: string
  rules: (string | string[])[]
  source: Source
  url?: string
  asked?: string
}

// why: CI fails when search answers fewer cases than this; raise it whenever search improves.
const FLOOR = { mtg: 29, fab: 18 }
type System = keyof typeof FLOOR
// why: a phone runs search several times slower than CI, and it runs on every keystroke.
const P95_BUDGET_MS = 10
const TOP = 3
const CACHE_HOURS = 12

const { values } = parseArgs({
  options: {
    misses: { type: "boolean", default: false },
    system: { type: "string" },
    cases: { type: "string" },
  },
})

async function rulesText(source: TextRules) {
  const dir = path.join(tmpdir(), "scryve-rules-search-eval")
  const file = path.join(dir, `${source.cacheKey}.txt`)
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_HOURS * 3_600_000)
    return readFileSync(file, "utf8")
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`${source.url} answered ${response.status}`)
  const text = await response.text()
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, text)
  return text
}

// why: a glossary term opens the first rule it cites, so a term citing nothing answers nothing.
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

async function evaluate(system: System, file: string) {
  const source = GAME_RULES[system]
  const rules = source.parse(await rulesText(source))
  if (!rules) throw new Error(`${system}: the downloaded rules no longer parse`)
  const cases: Case[] = JSON.parse(readFileSync(file, "utf8"))
  const problems: string[] = []
  const seen = new Set<string>()
  for (const { query, rules: wanted } of cases) {
    const key = query.trim().toLowerCase()
    if (seen.has(key)) problems.push(`duplicate query "${query}"`)
    seen.add(key)
    for (const id of wanted.flat())
      if (!findRules(rules, id)?.rules.some((rule) => rule.id === id))
        problems.push(`"${query}" names ${id}, which is not a rule in ${source.url}`)
  }

  const timings: number[] = []
  const bySource = new Map<Source, { passed: number; total: number }>()
  const misses: string[] = []
  let passed = 0
  let inTop = 0
  let empty = 0
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
    const tally = bySource.get(entry.source) ?? { passed: 0, total: 0 }
    bySource.set(entry.source, { passed: tally.passed + (hit ? 1 : 0), total: tally.total + 1 })
    if (hit) passed++
    if (rank >= 0 && rank < TOP) inTop++
    if (results.length === 0) empty++
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
    `${system}: ${cases.length} cases · first ${percent(passed, cases.length)} · top ${TOP} ${percent(inTop, cases.length)} · no results ${empty} · p50 ${percentile(sorted, 0.5).toFixed(2)}ms p95 ${p95.toFixed(2)}ms`,
  )
  console.log(
    `  ${[...bySource].map(([name, tally]) => `${name} ${percent(tally.passed, tally.total)}`).join(" · ")}`,
  )
  if (values.misses) console.log(misses.join("\n"))
  if (!values.cases && passed < FLOOR[system])
    problems.push(`answered ${passed}, below the floor of ${FLOOR[system]}`)
  if (p95 > P95_BUDGET_MS) problems.push(`p95 ${p95.toFixed(2)}ms is over ${P95_BUDGET_MS}ms`)
  for (const problem of problems) console.log(`  fail: ${problem}`)
  return problems.length === 0
}

async function main() {
  if (values.cases && !values.system) throw new Error("--cases needs --system")
  const systems = (Object.keys(FLOOR) as System[]).filter(
    (system) => !values.system || values.system === system,
  )
  let ok = true
  for (const system of systems)
    ok =
      (await evaluate(
        system,
        values.cases ?? path.join(__dirname, "rules-search", `${system}.json`),
      )) && ok
  if (!ok) process.exitCode = 1
}

void main()
