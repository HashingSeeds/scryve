/**
 * why: Expo only renders the QR code and keyboard shortcuts when it owns a real TTY,
 * so it inherits this process's stdio. Convex runs beside it with its output
 * piped and prefixed.
 */
const { spawn, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const readline = require("node:readline")
const { clearTimeout, setTimeout } = require("node:timers")

const {
  DEFAULT_METRO_PORT,
  convexEnv,
  devDeployment,
  expoEnv,
  isPortFree,
  liveRecords,
  needsInstall,
  planStart,
  readFile,
  removeRecord,
  scanDevProcesses,
  stopProcesses,
  withLock,
  writeRecord,
} = require("./dev-preflight.cjs")

const CONVEX_PREFIX = "\u001b[36m[convex]\u001b[0m "
const START_PREFIX = "\u001b[35m[start]\u001b[0m "
const FORCED_KILL_DELAY_MS = 4000
const root = fs.realpathSync(path.join(path.dirname(require.resolve("./dev.cjs")), ".."))
const localBin = (name) => path.join(root, "node_modules", ".bin", name)
const say = (line) => process.stdout.write(`${START_PREFIX}${line}\n`)

async function preflight() {
  const target = devDeployment(
    { ...convexEnv(root), ...process.env },
    {
      ...expoEnv(root),
      ...process.env,
    },
  )
  if (target.error) {
    say(target.error)
    process.exit(1)
  }

  const processes = scanDevProcesses()
  const running = liveRecords().find((record) => record.worktree === root)
  if (running) {
    say(`pnpm start is already running in this worktree (pid ${running.pid}); stop it first`)
    process.exit(1)
  }
  const stale = processes.filter((proc) => proc.cwd === root)
  if (stale.length > 0) {
    say(`Stopping stale ${stale.map((proc) => `${proc.kind} (pid ${proc.pid})`).join(", ")}`)
    await stopProcesses(stale)
  }

  // why: the lock is held only for the record check, port pick, and record write, so a 3 s stale stop never makes another start wait.
  const { port, owner } = await withLock(async () => {
    const plan = await planStart({
      records: liveRecords(),
      processes,
      worktree: root,
      deployment: target.deployment,
      isFree: isPortFree,
    })
    writeRecord({
      worktree: root,
      port: plan.port,
      deployment: target.deployment,
      convex: !plan.owner,
    })
    return plan
  })
  process.on("exit", () => removeRecord(root))

  if (owner)
    say(
      `\u001b[33mconvex dev for ${target.deployment} is already running from ${owner.cwd} (pid ${owner.pid}).\u001b[0m ` +
        "Starting Metro only, so this worktree's convex/ changes are NOT pushed. Stop that one to push from here.",
    )
  if (port !== DEFAULT_METRO_PORT) say(`Port ${DEFAULT_METRO_PORT} is taken. Metro uses ${port}`)

  const lockfile = readFile(path.join(root, "pnpm-lock.yaml"))
  if (needsInstall(lockfile, readFile(path.join(root, "node_modules", ".pnpm", "lock.yaml")))) {
    say("pnpm-lock.yaml changed since the last install. Running pnpm install --frozen-lockfile")
    const install = spawnSync("pnpm", ["install", "--frozen-lockfile"], {
      cwd: root,
      stdio: "inherit",
    })
    if (install.status !== 0) process.exit(install.status ?? 1)
  }
  return { port, startConvex: !owner }
}

async function main() {
  const { port, startConvex } = await preflight()

  const convex = startConvex
    ? spawn(localBin("convex"), ["dev"], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env: { ...process.env, FORCE_COLOR: "1" },
      })
    : null

  for (const stream of convex ? [convex.stdout, convex.stderr] : []) {
    readline.createInterface({ input: stream }).on("line", (line) => {
      process.stdout.write(`${CONVEX_PREFIX}${line}\n`)
    })
  }

  // why: every variant registers the shared `exp+count` scheme, which can open the preview build. Only the dev build owns `scryve-dev`.
  const expo = spawn(
    localBin("expo"),
    ["start", "--dev-client", "--scheme", "scryve-dev", "--port", String(port)],
    { stdio: "inherit", env: { ...process.env, APP_VARIANT: "development" } },
  )

  supervise(convex, expo)
}

const isRunning = (child) => child !== null && child.exitCode === null && child.signalCode === null

function supervise(convex, expo) {
  const signalConvexGroup = (signal) => {
    if (!convex) return
    try {
      const processGroup = -convex.pid
      process.kill(processGroup, signal)
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

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => shutdown(signal))

  let firstFailureCode = null
  const recordFirstFailure = (code) => {
    if (firstFailureCode === null) firstFailureCode = code ?? 1
    process.exitCode = firstFailureCode
  }

  convex?.on("exit", (code) => {
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
}

main().catch((error) => {
  say(error.message)
  process.exit(1)
})
