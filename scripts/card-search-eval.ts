import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { setTimeout as wait } from "node:timers/promises"
import { parseArgs } from "node:util"

import { fetchCardNameCatalog } from "../convex/lib/cardNameCatalog"
import { MAGIC_DATASET_URL } from "../convex/lib/magicDataset"
import { objectRecord, SCRYFALL_BASE_URL, SCRYFALL_HEADERS } from "../convex/lib/scryfall"
import { catalogNameIndex } from "../src/features/decks/cardNameMatch"
import {
  localMagicSearch,
  parseMagicCards,
  readsOnDevice,
  type MagicSearch,
} from "../src/features/decks/localMagicSearch"

type Source = "app" | "web" | "written"
type Case = { query: string; cards: string[]; source: Source; asked?: string }

const FLOOR = 234
const P95_BUDGET_MS = 10
const TOP = 3
const CACHE_HOURS = 12
// why: Scryfall asks API clients to wait 50 to 100ms between requests.
const SCRYFALL_GAP_MS = 100

const { values } = parseArgs({
  options: {
    misses: { type: "boolean", default: false },
    cases: { type: "string" },
  },
})

async function cached(name: string, load: () => Promise<string>) {
  const dir = path.join(tmpdir(), "scryve-card-search-eval")
  const file = path.join(dir, name)
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_HOURS * 3_600_000)
    return readFileSync(file, "utf8")
  const text = await load()
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, text)
  return text
}

async function download(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response
}

async function nameCatalog() {
  const text = await cached("card-names.json", async () =>
    JSON.stringify(
      await fetchCardNameCatalog(async (route) => {
        await wait(SCRYFALL_GAP_MS)
        const response = await download(`${SCRYFALL_BASE_URL}${route}`, SCRYFALL_HEADERS)
        return objectRecord(await response.json())
      }),
    ),
  )
  const catalog: { names: string; alternateNames: string } = JSON.parse(text)
  return catalog
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

function percent(count: number, total: number) {
  return `${count}/${total} (${total ? Math.round((count / total) * 100) : 0}%)`
}

async function main() {
  const magicCards = parseMagicCards(
    await cached("cards.json", async () => (await download(MAGIC_DATASET_URL)).text()),
  )
  const nameIndex = catalogNameIndex(await nameCatalog())
  const file = values.cases ?? path.join(__dirname, "card-search", "mtg.json")
  const cases: Case[] = JSON.parse(readFileSync(file, "utf8"))
  const search = (text: string): MagicSearch => ({
    text,
    commander: false,
    colors: [],
    colorMatch: "exact",
    filters: {},
  })

  const problems: string[] = []
  const seen = new Set<string>()
  for (const { query, cards } of cases) {
    const key = query.trim().toLowerCase()
    if (seen.has(key)) problems.push(`duplicate query "${query}"`)
    seen.add(key)
    if (!readsOnDevice(magicCards, search(query)))
      problems.push(`"${query}" goes to Scryfall, not the device`)
    for (const name of cards)
      if (!magicCards.byName.has(name))
        problems.push(`"${query}" names ${name}, which is not a card in ${MAGIC_DATASET_URL}`)
  }

  const timings: number[] = []
  const bySource = new Map<Source, { passed: number; total: number }>()
  const misses: string[] = []
  let passed = 0
  let inTop = 0
  let empty = 0
  for (const entry of cases) {
    let result: ReturnType<typeof localMagicSearch>
    let fastest = Infinity
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      result = localMagicSearch(magicCards, nameIndex, search(entry.query))
      fastest = Math.min(fastest, performance.now() - start)
    }
    timings.push(fastest)
    const named = new Set(result?.named.map((card) => card.name))
    const shown = [
      ...named,
      ...(result?.found ?? []).map((card) => card.name).filter((name) => !named.has(name)),
    ]
    const rank = shown.findIndex((name) => entry.cards.includes(name))
    const tally = bySource.get(entry.source) ?? { passed: 0, total: 0 }
    bySource.set(entry.source, {
      passed: tally.passed + (rank === 0 ? 1 : 0),
      total: tally.total + 1,
    })
    if (rank === 0) passed++
    if (rank >= 0 && rank < TOP) inTop++
    if (shown.length === 0) empty++
    if (rank !== 0)
      misses.push(
        `  ${entry.query} → ${entry.cards.join(" | ")}  got ${shown.length ? shown.slice(0, 3).join(", ") : "nothing"}${rank > 0 ? ` (#${rank + 1})` : ""}`,
      )
  }

  const sorted = timings.toSorted((a, b) => a - b)
  const p95 = percentile(sorted, 0.95)
  console.log(
    `mtg: ${cases.length} cases · first ${percent(passed, cases.length)} · top ${TOP} ${percent(inTop, cases.length)} · no results ${empty} · p50 ${percentile(sorted, 0.5).toFixed(2)}ms p95 ${p95.toFixed(2)}ms`,
  )
  console.log(
    `  ${[...bySource].map(([name, tally]) => `${name} ${percent(tally.passed, tally.total)}`).join(" · ")}`,
  )
  if (values.misses) console.log(misses.join("\n"))
  if (!values.cases && passed < FLOOR)
    problems.push(`ranked ${passed} first, below the floor of ${FLOOR}`)
  if (p95 > P95_BUDGET_MS) problems.push(`p95 ${p95.toFixed(2)}ms is over ${P95_BUDGET_MS}ms`)
  for (const problem of problems) console.log(`  fail: ${problem}`)
  if (problems.length) process.exitCode = 1
}

void main()
