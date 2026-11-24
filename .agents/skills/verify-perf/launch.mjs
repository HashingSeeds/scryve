#!/usr/bin/env node
// Times cold and hot launches of an installed preview build on the Android device the session
// drives, and writes the samples as JSON for compare.mjs. See SKILL.md for setup.
// Usage: launch.mjs <out.json> [runs]
//
// Per run:
// - Cold: relaunch the app under a Perfetto trace. `launchMs` is Android's own launch time, from
//   the tap to the app's first frame (android_startups), which the splash screen holds until ready. `interactiveMs` is from process start until
//   the app is interactive, from the app's own startup metrics (coldLaunchTime plus
//   timeToInteractive, the ones EAS Observe reports) that src/devtools/launchTimes.ts logs.
// - Hot: send the app home, open it again under a trace. `launchMs` is the same Android measure.
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { queryLastRow, traceProcessor } from "./perfetto.mjs"

const [out, runsArg = "10"] = process.argv.slice(2)
if (!out) throw new Error("usage: launch.mjs <out.json> [runs]")
const runs = Number(runsArg)
const [command, ...prefix] = (process.env.AD ?? "agent-device").split(" ")
const app = process.env.APP ?? "com.sowinghope.count.preview"
const tracer = await traceProcessor()

const device = (...args) =>
  execFileSync(command, [...prefix, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
const json = (...args) => JSON.parse(device(...args, "--json")).data

const startupQuery = (type) => `
INCLUDE PERFETTO MODULE android.startup.startups;
SELECT COUNT(*), MAX(dur) / 1e6 FROM android_startups
WHERE package = '${app}' AND startup_type = '${type}';`
function launchMs(trace, type) {
  const [count, ms] = queryLastRow(tracer, trace, startupQuery(type)).map(Number)
  if (count !== 1) throw new Error(`${trace} holds ${count} ${type} launches of ${app}`)
  return Math.round(ms)
}

async function traced(trace, action) {
  json("perf", "trace", "start", "--kind", "perfetto", "--out", trace)
  try {
    await action()
  } finally {
    json("perf", "trace", "stop", "--kind", "perfetto", "--out", trace)
  }
}

// The app logs `scryve-launch {...}` a second after it turns interactive.
async function launchTimes() {
  const path = json("logs", "path").path
  for (let waited = 0; waited < 30_000; waited += 500) {
    const line = existsSync(path)
      ? readFileSync(path, "utf8")
          .split("\n")
          .findLast((text) => text.includes("scryve-launch {"))
      : undefined
    if (line) return JSON.parse(line.slice(line.indexOf("{")))
    await sleep(500)
  }
  throw new Error(
    `no scryve-launch line in the app log; is ${app} a preview build with launchTimes?`,
  )
}

const traces = mkdtempSync(join(tmpdir(), "verify-perf-launch-"))
const samples = { Cold: [], Hot: [] }
json("open", app)
const { device: name } = json("perf", "frames")
try {
  for (let run = 1; run <= runs; run++) {
    const cold = join(traces, `cold-${run}.pftrace`)
    let times
    await traced(cold, async () => {
      device("open", app, "--relaunch")
      device("logs", "clear", "--restart")
      times = await launchTimes()
    })
    samples.Cold.push({
      launchMs: launchMs(cold, "cold"),
      // why: the app reports its startup metrics in seconds.
      interactiveMs: Math.round((times.coldLaunchTime + times.timeToInteractive) * 1000),
    })

    device("home")
    await sleep(2000)
    const hot = join(traces, `hot-${run}.pftrace`)
    await traced(hot, async () => {
      device("open", app)
      await sleep(2000)
    })
    samples.Hot.push({ launchMs: launchMs(hot, "hot") })
    rmSync(cold)
    rmSync(hot)
    console.error(
      `run ${run}/${runs}: cold ${JSON.stringify(samples.Cold.at(-1))} hot ${JSON.stringify(samples.Hot.at(-1))}`,
    )
  }
} finally {
  rmSync(traces, { recursive: true, force: true })
}
writeFileSync(out, `${JSON.stringify({ device: name, app, samples }, null, 2)}\n`)
