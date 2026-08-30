#!/usr/bin/env node
/*
 * Runs `convex dev` alongside the Expo dev server.
 *
 * Expo only renders the QR code and keyboard shortcuts when it owns a real TTY,
 * so it inherits this process's stdio. Convex runs beside it with its output
 * piped and prefixed.
 */
const { spawn } = require("node:child_process")
const readline = require("node:readline")

const CONVEX_PREFIX = "\u001b[36m[convex]\u001b[0m "

const convex = spawn("npx", ["convex", "dev"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, FORCE_COLOR: "1" },
})

for (const stream of [convex.stdout, convex.stderr]) {
  readline.createInterface({ input: stream }).on("line", (line) => {
    process.stdout.write(`${CONVEX_PREFIX}${line}\n`)
  })
}

const expo = spawn("npx", ["expo", "start", "--dev-client"], {
  stdio: "inherit",
  env: { ...process.env, APP_VARIANT: "development" },
})

let shuttingDown = false
const shutdown = (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of [convex, expo]) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
}

// Ctrl-C already reaches both children through the process group; this covers the rest.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(signal))

convex.on("exit", (code) => {
  if (shuttingDown) return
  process.stdout.write(`${CONVEX_PREFIX}exited with code ${code}\n`)
  shutdown("SIGTERM")
})

expo.on("exit", (code) => {
  shutdown("SIGTERM")
  process.exitCode = code ?? 0
})
