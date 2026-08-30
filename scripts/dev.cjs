#!/usr/bin/env node
/*
 * Runs `convex dev` alongside the Expo dev server.
 *
 * Expo only renders the QR code and keyboard shortcuts when it owns a real TTY,
 * so it inherits this process's stdio. Convex runs beside it with its output
 * piped and prefixed.
 */
const { spawn } = require("node:child_process")
const path = require("node:path")
const readline = require("node:readline")
const { clearTimeout, setTimeout } = require("node:timers")

const CONVEX_PREFIX = "\u001b[36m[convex]\u001b[0m "
const FORCED_KILL_DELAY_MS = 4000
const localBin = (name) => path.join(process.cwd(), "node_modules", ".bin", name)

// Detached so convex leads its own process group, which shutdown can signal as a
// unit; the CLI's own children would otherwise outlive it.
const convex = spawn(localBin("convex"), ["dev"], {
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env: { ...process.env, FORCE_COLOR: "1" },
})

for (const stream of [convex.stdout, convex.stderr]) {
  readline.createInterface({ input: stream }).on("line", (line) => {
    process.stdout.write(`${CONVEX_PREFIX}${line}\n`)
  })
}

const expo = spawn(localBin("expo"), ["start", "--dev-client"], {
  stdio: "inherit",
  env: { ...process.env, APP_VARIANT: "development" },
})

const isRunning = (child) => child.exitCode === null && child.signalCode === null

const signalConvexGroup = (signal) => {
  try {
    process.kill(-convex.pid, signal) // a negative pid addresses the group
  } catch (error) {
    const groupAlreadyGone = error.code === "ESRCH"
    if (!groupAlreadyGone) throw error
  }
}

let shuttingDown = false
let forcedKillTimer = null

const shutdown = (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  signalConvexGroup(signal)
  if (isRunning(expo)) expo.kill(signal)
  forcedKillTimer = setTimeout(() => {
    process.stdout.write(`${CONVEX_PREFIX}ignored ${signal}; sending SIGKILL\n`)
    signalConvexGroup("SIGKILL")
    if (isRunning(expo)) expo.kill("SIGKILL")
  }, FORCED_KILL_DELAY_MS)
}

const sweepOnceBothExited = () => {
  if (isRunning(convex) || isRunning(expo)) return
  clearTimeout(forcedKillTimer)
  signalConvexGroup("SIGKILL")
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(signal))

let firstFailureCode = null
const recordFirstFailure = (code) => {
  if (firstFailureCode === null) firstFailureCode = code ?? 1
  process.exitCode = firstFailureCode
}

convex.on("exit", (code) => {
  if (!shuttingDown) {
    process.stdout.write(`${CONVEX_PREFIX}exited with code ${code}\n`)
    recordFirstFailure(code)
  }
  shutdown("SIGTERM")
  sweepOnceBothExited()
})

expo.on("exit", (code) => {
  if (!shuttingDown && code !== 0) recordFirstFailure(code)
  shutdown("SIGTERM")
  sweepOnceBothExited()
})
