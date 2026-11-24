#!/usr/bin/env node
// Runs each perf scenario several times on the Android device the app is open on, under a
// Perfetto trace, and writes CPU and frame samples as JSON. Run it on the Mac mini:
// agent-device-mini writes traces to --out paths there. See SKILL.md for setup.
// Usage: run.mjs <out.json> [runs]
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { queryLastRow, traceProcessor } from "./perfetto.mjs"

const [out, runsArg = "10"] = process.argv.slice(2)
if (!out) throw new Error("usage: run.mjs <out.json> [runs]")
const runs = Number(runsArg)
const [command, ...prefix] = (process.env.AD ?? "agent-device").split(" ")
const app = process.env.APP ?? "com.sowinghope.count.dev"
const here = dirname(fileURLToPath(import.meta.url))
const flows = join(here, "../../../.maestro/perf")
const scenarios = ["LifeTaps", "MenuToggle"]

const tracer = await traceProcessor()

const device = (...args) =>
  execFileSync(command, [...prefix, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
const json = (...args) => JSON.parse(device(...args, "--json")).data
const replay = (flow) =>
  device(
    "replay",
    join(flows, `${flow}.yaml`),
    "--maestro",
    "--timeout",
    "300000",
    "-e",
    `MAESTRO_APP_ID=${app}`,
  )

// Milliseconds of CPU the app's JS thread (mqt_v_js, or mqt_js on the old architecture) and its
// UI thread used over the whole trace. A total, not a share of the time: Maestro waits for the
// app to settle after each tap, so slower JS also stretches the scenario. The trace's 32 MB ring
// buffer fills in about 20 seconds of menu animation; a scenario that outgrows it throws.
const cpuQuery = (pid) => `
SELECT
  (SELECT value FROM stats WHERE name = 'traced_buf_bytes_overwritten'),
  SUM(IIF(thread.name GLOB 'mqt*js', sched.dur, 0)) / 1e6,
  SUM(IIF(thread.tid = process.pid, sched.dur, 0)) / 1e6
FROM sched JOIN thread USING (utid) JOIN process USING (upid)
WHERE process.pid = ${Number(pid)};`
function cpu(trace, pid) {
  const [overwritten, jsMs, uiMs] = queryLastRow(tracer, trace, cpuQuery(pid)).map(Number)
  if (overwritten > 0) throw new Error(`${trace} outgrew the trace buffer; shorten the scenario`)
  if (!(jsMs > 0)) throw new Error(`no JS thread CPU in ${trace}`)
  return { jsCpuMs: Math.round(jsMs), uiCpuMs: Math.round(uiMs) }
}

const traces = mkdtempSync(join(tmpdir(), "verify-perf-"))
replay("Prepare")
const samples = Object.fromEntries(scenarios.map((scenario) => [scenario, []]))
const { device: name } = json("perf", "frames")
try {
  for (let run = 1; run <= runs; run++) {
    for (const scenario of scenarios) {
      replay("Board4")
      const trace = join(traces, `${scenario}-${run}.pftrace`)
      json("perf", "frames") // resets gfxinfo, so frames cover only the scenario
      json("perf", "trace", "start", "--kind", "perfetto", "--out", trace)
      let stopped
      try {
        replay(scenario)
      } finally {
        stopped = json("perf", "trace", "stop", "--kind", "perfetto", "--out", trace)
      }
      const frames = stopped.summary.frameHealth
      if (!frames.available) throw new Error(`no frame health for ${scenario}: ${frames.reason}`)
      samples[scenario].push({
        ...cpu(trace, stopped.appPid),
        droppedFramePercent: frames.droppedFramePercent,
        frames: frames.totalFrameCount,
      })
      rmSync(trace)
      console.error(`run ${run}/${runs} ${scenario}: ${JSON.stringify(samples[scenario].at(-1))}`)
    }
  }
} finally {
  rmSync(traces, { recursive: true, force: true })
}
writeFileSync(out, `${JSON.stringify({ device: name, app, samples }, null, 2)}\n`)
