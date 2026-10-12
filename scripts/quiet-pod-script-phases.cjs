const { spawn } = require("node:child_process")
const { constants } = require("node:os")
const { clearTimeout, setTimeout } = require("node:timers")

// why: hide only pods whose script phases we inspected, so a new pod or a changed count still prints. Expo pods swap Debug/Release xcframeworks and resolve dSYMs; React Native pods swap Debug/Release binaries.
const KNOWN_SCRIPT_PHASES = {
  "ExpoCamera": 2,
  "ExpoCameraBarcodeScanning": 2,
  "ExpoFileSystem": 2,
  "ExpoFont": 2,
  "ExpoImage": 2,
  "ExpoModulesCore": 2,
  "ExpoModulesWorklets": 2,
  "React-Core-prebuilt": 1,
  "ReactNativeDependencies": 1,
  "hermes-engine": 1,
}

const ANSI = /\x1b\[[0-9;]*m/g
const SCRIPT_PHASE_WARNING = /\[!\] (\S+) has added (\d+) script phases?\. Please inspect/

const COCOAPODS_WARNING_MARKER = "[!]"

function isKnownScriptPhaseWarning(line) {
  const match = line.replace(ANSI, "").match(SCRIPT_PHASE_WARNING)
  return match !== null && KNOWN_SCRIPT_PHASES[match[1]] === Number(match[2])
}

// why: prompts end without a newline, so a partial line flushes after a pause or when the other stream writes, keeping order.
function createLineFilter(input, output, filters) {
  let pending = ""
  let flushTimer
  const filter = {
    flushPartialLine() {
      clearTimeout(flushTimer)
      if (pending.replace(ANSI, "").includes(COCOAPODS_WARNING_MARKER)) return
      output.write(pending)
      pending = ""
    },
  }
  filters.push(filter)
  input.setEncoding("utf8")
  input.on("data", (chunk) => {
    clearTimeout(flushTimer)
    for (const other of filters) if (other !== filter) other.flushPartialLine()
    const lines = (pending + chunk).split("\n")
    pending = lines.pop()
    for (const line of lines) {
      if (!isKnownScriptPhaseWarning(line)) output.write(`${line}\n`)
    }
    if (pending) flushTimer = setTimeout(filter.flushPartialLine, 100)
  })
  input.on("end", () => {
    clearTimeout(flushTimer)
    if (!isKnownScriptPhaseWarning(pending)) output.write(pending)
  })
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2)
  const child = spawn(command, args, {
    stdio: ["inherit", "pipe", "pipe"],
    env: { FORCE_COLOR: "1", ...process.env },
  })
  const filters = []
  createLineFilter(child.stdout, process.stdout, filters)
  createLineFilter(child.stderr, process.stderr, filters)

  const forwarded = Object.fromEntries(
    ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [signal, () => child.kill(signal)]),
  )
  for (const [signal, handler] of Object.entries(forwarded)) process.on(signal, handler)

  child.on("close", (code, signal) => {
    // why: Node ignores some signals (SIGPIPE), so re-raising may not end the wrapper; the shell's 128+N code stands in.
    process.exitCode = code ?? 128 + constants.signals[signal]
    if (!signal) return
    for (const [name, handler] of Object.entries(forwarded)) process.off(name, handler)
    process.stdout.write("", () =>
      process.stderr.write("", () => process.kill(process.pid, signal)),
    )
  })
}

module.exports = { isKnownScriptPhaseWarning }
