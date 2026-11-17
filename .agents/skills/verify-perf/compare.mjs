#!/usr/bin/env node
// Compares two run.mjs results from the same device. A metric regresses when the after runs
// are worse than the before runs with p <= 0.01 on an exact one-sided permutation test
// (Mann-Whitney U over every relabeling), so run-to-run noise rarely fails a change.
// Usage: compare.mjs <before.json> <after.json>. Exits 1 on a regression.
import { readFileSync } from "node:fs"

const [before, after] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8")))
if (!before || !after) throw new Error("usage: compare.mjs <before.json> <after.json>")
if (before.device !== after.device)
  throw new Error(`different devices: ${before.device} and ${after.device}`)

const lowerIsBetter = ["jsCpuMs", "uiCpuMs", "droppedFramePercent"]
const threshold = 0.01

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const worseCount = (was, now) =>
  now.reduce(
    (count, value) =>
      count + was.reduce((pairs, old) => pairs + (value > old ? 1 : value === old ? 0.5 : 0), 0),
    0,
  )

function pValue(was, now) {
  const pooled = [...was, ...now]
  const observed = worseCount(was, now)
  let atLeast = 0
  let total = 0
  const pick = (start, chosen) => {
    if (chosen.length === now.length) {
      const picked = new Set(chosen)
      const relabeledNow = chosen.map((index) => pooled[index])
      const relabeledWas = pooled.filter((_, index) => !picked.has(index))
      total++
      if (worseCount(relabeledWas, relabeledNow) >= observed) atLeast++
      return
    }
    for (let index = start; index < pooled.length; index++) pick(index + 1, [...chosen, index])
  }
  pick(0, [])
  return atLeast / total
}

let regressed = false
console.log(`${before.device}: metric, before median (range), after median (range), p, verdict`)
for (const [scenario, runs] of Object.entries(after.samples)) {
  for (const metric of lowerIsBetter) {
    const was = before.samples[scenario].map((sample) => sample[metric])
    const now = runs.map((sample) => sample[metric])
    const p = pValue(was, now)
    const worse = p <= threshold
    regressed ||= worse
    const range = (values) => `${Math.min(...values)}-${Math.max(...values)}`
    console.log(
      `${scenario} ${metric}: ${median(was)} (${range(was)}), ${median(now)} (${range(now)}), p=${p.toFixed(3)}, ${worse ? "REGRESSED" : "ok"}`,
    )
  }
}
process.exit(regressed ? 1 : 0)
