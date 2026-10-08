const { spawnSync } = require("node:child_process")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const net = require("node:net")
const os = require("node:os")
const path = require("node:path")
const { setTimeout } = require("node:timers")

const DEFAULT_METRO_PORT = 8081
const LAST_METRO_PORT = 8099
const STOP_WAIT_MS = 3000
const LOCK_WAIT_MS = 15_000
const ORPHAN_LOCK_MS = 5000

const stateDir = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
  "scryve-dev",
)

// why: pnpm keeps a copy of the lockfile it last installed, so a byte comparison tells whether this worktree's install is stale without any state of our own.
function needsInstall(lockfile, installedLockfile) {
  if (!lockfile) return false
  return !installedLockfile || !lockfile.equals(installedLockfile)
}

const DEV_COMMANDS = [
  { kind: "metro", script: /(?:\.bin\/expo|expo\/bin\/cli)$/, command: "start" },
  { kind: "convex", script: /(?:\.bin\/convex|convex\/bin\/main\.js)$/, command: "dev" },
]

// why: match the node process itself by argv, not shells or editors that merely mention the command.
function devKind(argv) {
  if (!/(?:^|\/)node$/.test(argv[0] ?? "")) return null
  const [script, command] = argv.slice(1).filter((arg) => !arg.startsWith("-"))
  return (
    DEV_COMMANDS.find((dev) => dev.script.test(script ?? "") && dev.command === command)?.kind ??
    null
  )
}

function devProcesses(rows) {
  return rows.flatMap(({ pid, argv }) => {
    const kind = devKind(argv)
    return kind ? [{ pid, kind }] : []
  })
}

function parseEnv(text) {
  const values = {}
  for (const line of text.split("\n")) {
    const [, name, raw] = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/) ?? []
    if (!name) continue
    const quoted = raw.match(/^(["'])(.*)\1\s*(?:#.*)?$/)
    values[name] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, "").trim()
  }
  return values
}

/** why: Convex reads only .env.local and .env, while Expo also layers the per-mode files, so a preview override can split the two. */
function devDeployment(convexEnv, expoEnv) {
  const key = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN"].find((name) => convexEnv[name])
  if (key) return { error: `${key} is set, so convex dev would not use the dev deployment.` }
  const name = convexEnv.CONVEX_DEPLOYMENT?.match(/^dev:([a-z0-9-]+)$/)?.[1]
  if (!name)
    return {
      error: `CONVEX_DEPLOYMENT is ${convexEnv.CONVEX_DEPLOYMENT || "unset"}, not dev:<name>. See README.md.`,
    }
  const url = expoEnv.EXPO_PUBLIC_CONVEX_URL?.replace(/\/$/, "")
  if (url && url !== `https://${name}.convex.cloud`)
    return {
      error: `Metro would use ${url}, not the dev deployment ${name}. For a preview, run pnpm start:expo.`,
    }
  return { deployment: name }
}

/** why: a record claims the deployment before its convex dev appears in the process list, which closes the race between two starts. */
function convexOwner(processes, records, worktree, deployment) {
  const claims = records
    .filter((record) => record.convex)
    .map((record) => ({ cwd: record.worktree, pid: record.pid, deployment: record.deployment }))
  const running = processes.filter((proc) => proc.kind === "convex")
  return [...claims, ...running].find(
    (owner) => owner.cwd !== worktree && owner.deployment === deployment,
  )
}

async function pickPort(isFree, reserved = new Set()) {
  for (let port = DEFAULT_METRO_PORT; port <= LAST_METRO_PORT; port++) {
    if (!reserved.has(port) && (await isFree(port))) return port
  }
  throw new Error(`No free Metro port between ${DEFAULT_METRO_PORT} and ${LAST_METRO_PORT}`)
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", () => resolve(false))
    server.listen(port, () => server.close(() => resolve(true)))
  })
}

function readFile(file) {
  try {
    return fs.readFileSync(file)
  } catch {
    return null
  }
}

function readEnv(dir, files) {
  return Object.assign(
    {},
    ...files.map((file) => parseEnv(readFile(path.join(dir, file))?.toString() ?? "")),
  )
}

const convexEnv = (dir) => readEnv(dir, [".env", ".env.local"])
const expoEnv = (dir) =>
  readEnv(dir, [".env", ".env.development", ".env.local", ".env.development.local"])

function readLink(link) {
  try {
    return fs.readlinkSync(link)
  } catch {
    return null
  }
}

/** why: on macOS ps joins argv with spaces, so a dev command whose path contains a space is not found there. Linux keeps exact argv boundaries. */
function processTable() {
  if (process.platform !== "linux") {
    const ps = spawnSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" }).stdout ?? ""
    return ps.split("\n").flatMap((line) => {
      const [, pid, command] = line.match(/^\s*(\d+)\s+(.*)$/) ?? []
      return pid ? [{ pid: Number(pid), argv: command.split(/\s+/) }] : []
    })
  }
  // why: spawning ps costs 50 ms or more on a busy Linux box, while reading /proc directly takes about 10 ms.
  return fs
    .readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .map((pid) => ({
      pid: Number(pid),
      argv: readFile(`/proc/${pid}/cmdline`)?.toString().split("\0").slice(0, -1) ?? [],
    }))
}

/** why: start time plus cwd plus cmdline tells a reused pid apart from the process that was found earlier. */
function processInfo(pid) {
  if (process.platform === "linux") {
    const stat = readFile(`/proc/${pid}/stat`)?.toString()
    const cmdline = readFile(`/proc/${pid}/cmdline`)?.toString()
    const cwd = readLink(`/proc/${pid}/cwd`)
    if (!stat || !cmdline || !cwd) return null
    const startTime = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]
    return { cwd, identity: `${startTime}\0${cwd}\0${cmdline}` }
  }
  const started = spawnSync("ps", ["-o", "lstart=,command=", "-p", String(pid)], {
    encoding: "utf8",
  }).stdout?.trim()
  const lsof = spawnSync("lsof", ["-a", "-d", "cwd", "-Fn", "-p", String(pid)], {
    encoding: "utf8",
  }).stdout
  const cwd = lsof?.match(/^n(.*)$/m)?.[1]
  if (!started || !cwd) return null
  return { cwd, identity: `${started}\0${cwd}` }
}

function scanDevProcesses() {
  return devProcesses(processTable()).flatMap((proc) => {
    const info = proc.pid === process.pid ? null : processInfo(proc.pid)
    if (!info) return []
    const deployment =
      proc.kind === "convex"
        ? convexEnv(info.cwd).CONVEX_DEPLOYMENT?.match(/^dev:(.+)$/)?.[1]
        : undefined
    return [{ ...proc, ...info, deployment }]
  })
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function stopProcesses(procs, info = processInfo) {
  const signalIfSame = (proc, name) => {
    if (info(proc.pid)?.identity !== proc.identity) return false
    try {
      process.kill(proc.pid, name)
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
    return true
  }
  const signaled = procs.filter((proc) => signalIfSame(proc, "SIGTERM"))
  const deadline = Date.now() + STOP_WAIT_MS
  while (signaled.some((proc) => isAlive(proc.pid)) && Date.now() < deadline) await sleep(50)
  for (const proc of signaled) signalIfSame(proc, "SIGKILL")
}

/** why: two starts must not both see a free port or an unclaimed deployment, so scan, pick, and record happen under one O_EXCL lock. A holder that died leaves its pid behind, and a lock with no pid is the crash window between create and write. */
async function withLock(dir, fn, waitMs = LOCK_WAIT_MS) {
  fs.mkdirSync(dir, { recursive: true })
  const lock = path.join(dir, "lock")
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx" })
      break
    } catch (error) {
      if (error.code !== "EEXIST") throw error
    }
    const content = readFile(lock)?.toString()
    const holder = Number(content)
    const orphaned = holder
      ? !isAlive(holder)
      : Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? 0) > ORPHAN_LOCK_MS
    if (orphaned && readFile(lock)?.toString() === content) {
      fs.rmSync(lock, { force: true })
      continue
    }
    if (Date.now() > deadline) throw new Error(`Another pnpm start holds ${lock} (pid ${holder})`)
    await sleep(25)
  }
  try {
    return await fn()
  } finally {
    fs.rmSync(lock, { force: true })
  }
}

const recordFile = (worktree) =>
  path.join(
    stateDir,
    `${path.basename(worktree)}-${createHash("sha256").update(worktree).digest("hex").slice(0, 8)}.json`,
  )

/** why: a crashed run leaves its record behind, so records whose pid is gone or now names another process are pruned instead of holding a port or deployment forever. */
function liveRecords() {
  const names = fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : []
  return names
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const file = path.join(stateDir, name)
      try {
        const record = JSON.parse(fs.readFileSync(file, "utf8"))
        if (processInfo(record.pid)?.identity === record.identity) return [record]
      } catch {}
      fs.rmSync(file, { force: true })
      return []
    })
}

function writeRecord(record) {
  fs.mkdirSync(stateDir, { recursive: true })
  const { identity } = processInfo(process.pid) ?? {}
  fs.writeFileSync(
    recordFile(record.worktree),
    `${JSON.stringify({ ...record, pid: process.pid, identity })}\n`,
  )
}

function removeRecord(worktree) {
  const file = recordFile(worktree)
  const record = JSON.parse(readFile(file) ?? "null")
  if (record?.pid === process.pid) fs.rmSync(file, { force: true })
}

module.exports = {
  DEFAULT_METRO_PORT,
  convexEnv,
  convexOwner,
  devDeployment,
  devKind,
  devProcesses,
  expoEnv,
  isPortFree,
  liveRecords,
  needsInstall,
  parseEnv,
  pickPort,
  processInfo,
  readFile,
  removeRecord,
  scanDevProcesses,
  stateDir,
  stopProcesses,
  withLock,
  writeRecord,
}
