const { spawn } = require("node:child_process")
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

function isKnownScriptPhaseWarning(line) {
  const match = line.replace(ANSI, "").match(SCRIPT_PHASE_WARNING)
  return match !== null && KNOWN_SCRIPT_PHASES[match[1]] === Number(match[2])
}

// why: interactive prompts end without a newline, so a partial line flushes after a short pause.
function filterStream(input, output) {
  let pending = ""
  let flushTimer
  const flush = () => {
    output.write(pending)
    pending = ""
  }
  input.on("data", (chunk) => {
    clearTimeout(flushTimer)
    const lines = (pending + chunk).split("\n")
    pending = lines.pop()
    for (const line of lines) {
      if (!isKnownScriptPhaseWarning(line)) output.write(`${line}\n`)
    }
    if (pending) flushTimer = setTimeout(flush, 100)
  })
  input.on("end", () => {
    clearTimeout(flushTimer)
    if (pending && !isKnownScriptPhaseWarning(pending)) flush()
  })
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2)
  const child = spawn(command, args, {
    stdio: ["inherit", "pipe", "pipe"],
    env: { FORCE_COLOR: "1", ...process.env },
  })
  filterStream(child.stdout, process.stdout)
  filterStream(child.stderr, process.stderr)
  child.on("close", (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 1)
  })
}

module.exports = { isKnownScriptPhaseWarning }
