const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

// Measures a release Android APK so two builds (say main and a dependency bump) can be compared:
//   node scripts/measure-native.cjs size <apk> > base/size.json
//   node scripts/measure-native.cjs startup <appId> [runs] > base/startup.json
//   node scripts/measure-native.cjs compare base head
// bundle-size.cjs only sees the JS bundle; this covers native libraries and cold start.

const JS_BUNDLE = "assets/index.android.bundle"
const LIB = /^lib\/([^/]+)\/([^/]+\.so)$/
const ENTRY = /^\s*(\d+)\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+[0-9a-f]{8}\s+(.+)$/

/** Reads `unzip -v` output: uncompressed size per native library and the JS bundle size. */
function parseApkListing(listing) {
  const abis = {}
  let jsBytes = 0
  for (const line of listing.split("\n")) {
    const entry = ENTRY.exec(line)
    if (!entry) continue
    const [, bytes, name] = entry
    if (name === JS_BUNDLE) jsBytes = Number(bytes)
    const lib = LIB.exec(name)
    if (lib) (abis[lib[1]] ??= {})[lib[2]] = Number(bytes)
  }
  return { jsBytes, abis }
}

function size(apk) {
  const listing = execFileSync("unzip", ["-v", apk], { encoding: "utf8", maxBuffer: 64e6 })
  return { apkBytes: fs.statSync(apk).size, ...parseApkListing(listing) }
}

const TOTAL_TIME = /^TotalTime:\s*(\d+)/m
// Logged by src/app/_layout.tsx right after AppMetrics.markInteractive().
const INTERACTIVE_MARKER = "scryve:interactive"

function adb(...args) {
  return execFileSync("adb", args, { encoding: "utf8", maxBuffer: 64e6 })
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** Milliseconds from the app's process fork to the interactive marker, from `logcat -v epoch`. */
function parseInteractiveMs(logcat, appId) {
  let start
  for (const line of logcat.split("\n")) {
    const seconds = Number.parseFloat(line)
    if (Number.isNaN(seconds)) continue
    if (line.includes(`created for ${appId}`)) start = seconds
    else if (start !== undefined && line.includes(INTERACTIVE_MARKER))
      return Math.round((seconds - start) * 1000)
  }
  return undefined
}

function waitForInteractive(appId) {
  for (let waited = 0; waited < 30_000; waited += 250) {
    const ms = parseInteractiveMs(adb("logcat", "-d", "-v", "epoch"), appId)
    if (ms !== undefined) return ms
    sleep(250)
  }
  throw new Error(`No "${INTERACTIVE_MARKER}" in logcat within 30 s. Is this build from main?`)
}

/**
 * Cold starts the app `runs` times. firstFrame is am start's TotalTime (the splash's first
 * frame); interactive is process fork to the marker. The first launch after install also
 * compiles and warms caches, so it is dropped.
 */
function startup(appId, runs) {
  const component = adb("shell", "cmd", "package", "resolve-activity", "--brief", appId)
    .trim()
    .split("\n")
    .at(-1)
  if (!component?.includes("/")) throw new Error(`No launcher activity for ${appId}`)
  const firstFrame = []
  const interactive = []
  for (let run = 0; run <= runs; run++) {
    adb("shell", "am", "force-stop", appId)
    adb("logcat", "-c")
    const match = TOTAL_TIME.exec(adb("shell", "am", "start", "-W", "-n", component))
    if (!match) throw new Error(`am start reported no TotalTime for ${component}`)
    const interactiveMs = waitForInteractive(appId)
    if (run > 0) {
      firstFrame.push(Number(match[1]))
      interactive.push(interactiveMs)
    }
    // Let post-launch work settle so it doesn't overlap the next cold start.
    sleep(2000)
  }
  return { component, firstFrame: summarize(firstFrame), interactive: summarize(interactive) }
}

function summarize(times) {
  const sorted = [...times].sort((a, b) => a - b)
  const at = (quantile) => sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))]
  return { runs: times, medianMs: at(0.5), p90Ms: at(0.9) }
}

const kilobytes = (bytes) => `${Math.round(bytes / 1000).toLocaleString("en-US")} KB`

function delta(head, base) {
  if (base === undefined) return "added"
  if (head === undefined) return "removed"
  const kb = Math.round((head - base) / 1000)
  return kb === 0 ? "no change" : `${kb > 0 ? "+" : "-"}${Math.abs(kb).toLocaleString("en-US")} KB`
}

const sum = (libs = {}) => Object.values(libs).reduce((total, bytes) => total + bytes, 0)

/** Renders a markdown table of what changed between two measured builds. */
function renderComparison(base, head) {
  const rows = [
    ["APK (compressed)", base.size.apkBytes, head.size.apkBytes],
    ["JS bundle", base.size.jsBytes, head.size.jsBytes],
  ]
  const abis = [...new Set([...Object.keys(base.size.abis), ...Object.keys(head.size.abis)])].sort()
  const libRows = []
  for (const abi of abis) {
    const [baseLibs = {}, headLibs = {}] = [base.size.abis[abi], head.size.abis[abi]]
    rows.push([`Native libs, ${abi}`, sum(baseLibs), sum(headLibs)])
    for (const lib of [...new Set([...Object.keys(baseLibs), ...Object.keys(headLibs)])].sort()) {
      if (baseLibs[lib] !== headLibs[lib])
        libRows.push(`| ${abi} | ${lib} | ${delta(headLibs[lib], baseLibs[lib])} |`)
    }
  }
  const lines = [
    "| | Base | Head | Change |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      ([name, b, h]) => `| ${name} | ${kilobytes(b)} | ${kilobytes(h)} | ${delta(h, b)} |`,
    ),
  ]
  if (base.startup && head.startup) {
    for (const [phase, name] of [
      ["firstFrame", "first frame"],
      ["interactive", "interactive"],
    ]) {
      for (const [key, label] of [
        ["medianMs", "median"],
        ["p90Ms", "p90"],
      ]) {
        const [b, h] = [base.startup[phase][key], head.startup[phase][key]]
        lines.push(
          `| Cold start to ${name}, ${label} | ${b} ms | ${h} ms | ${h > b ? "+" : ""}${h - b} ms |`,
        )
      }
    }
  }
  if (libRows.length > 0)
    lines.push("", "| ABI | Library | Change |", "| --- | --- | --- |", ...libRows)
  return lines.join("\n")
}

function readBuild(dir) {
  const read = (name) => {
    const file = path.join(dir, name)
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined
  }
  const size = read("size.json")
  if (!size) throw new Error(`${dir}/size.json is missing`)
  return { size, startup: read("startup.json") }
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2)
  const print = (value) => console.log(JSON.stringify(value, null, 2))
  if (command === "size" && args.length === 1) print(size(args[0]))
  else if (command === "startup" && args.length <= 2 && args[0])
    print(startup(args[0], Number(args[1] ?? 20)))
  else if (command === "compare" && args.length === 2)
    console.log(renderComparison(readBuild(args[0]), readBuild(args[1])))
  else {
    console.error(
      "Usage: measure-native.cjs size <apk> | startup <appId> [runs] | compare <baseDir> <headDir>",
    )
    process.exit(1)
  }
}

module.exports = { parseApkListing, parseInteractiveMs, summarize, renderComparison }
