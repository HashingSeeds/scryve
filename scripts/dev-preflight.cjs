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
const LOCK_BASE_PORT = Number(process.env.SCRYVE_DEV_LOCK_PORT || 18080)
if (!Number.isInteger(LOCK_BASE_PORT) || LOCK_BASE_PORT < 1024 || LOCK_BASE_PORT > 65526)
  throw new Error(`SCRYVE_DEV_LOCK_PORT must be a port from 1024 to 65526`)
const LOCK_PORTS = Array.from({ length: 10 }, (_, index) => LOCK_BASE_PORT + index)
const LOCK_TOKEN = "scryve-dev-lock\n"
const LOCK_PROBE_MS = 100
const TEMP_RECORD_MAX_AGE_MS = 60_000
const LOCK_WAIT_MS = 2000

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

/** why: two starts must not both see a free port or an unclaimed deployment. Binding a loopback port is atomic and the kernel frees it when the holder dies. A port is skipped only when the OS names a listener that is clearly not a dev starter, so every starter walks the same list and meets on the same port. */
async function withLock(fn, { ports = LOCK_PORTS, waitMs = LOCK_WAIT_MS } = {}) {
  const deadline = Date.now() + waitMs
  for (;;) {
    let holder = null
    for (const port of ports) {
      const server = await listen(port)
      if (server) {
        try {
          return await fn()
        } finally {
          await new Promise((resolve) => server.close(resolve))
        }
      }
      holder = await lockHolder(port)
      if (holder) break
    }
    if (!holder)
      throw new Error(
        `Every lock port from ${ports[0]} to ${ports.at(-1)} is used by another app. ${OTHER_LOCK_PORTS}`,
      )
    if (Date.now() > deadline) throw new Error(lockBusyMessage(holder, waitMs))
    await sleep(25)
  }
}

const OTHER_LOCK_PORTS =
  "Set SCRYVE_DEV_LOCK_PORT=<port> for every pnpm start to use the 10 lock ports from there instead."

function lockBusyMessage(holder, waitMs) {
  const pid = holder.pid ?? listenerPid(holder.port)
  const busy = `Lock port ${holder.port} has been`
  if (pid)
    return `${busy} held by pid ${pid} for over ${waitMs / 1000} s. Stop it if it is a stuck pnpm start or another app. ${OTHER_LOCK_PORTS}`
  return `${busy} busy for over ${waitMs / 1000} s and its owner is unknown. Find it with \`lsof -nP -iTCP:${holder.port} -sTCP:LISTEN\` (Linux: \`ss -ltnp 'sport = :${holder.port}'\`) and stop it. ${OTHER_LOCK_PORTS}`
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end(LOCK_TOKEN))
    server.once("error", (error) => (error.code === "EADDRINUSE" ? resolve(null) : reject(error)))
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => resolve(server))
  })
}

/** why: a holder busy in its critical section cannot answer, so silence is never proof of a foreign app. Only an OS-named listener that is not a dev starter frees the port for skipping; an unknown owner fails closed. */
async function lockHolder(port) {
  const reply = await probe(port)
  if (reply === "token" || reply === "refused") return { port, pid: null }
  const pid = listenerPid(port)
  const argv = pid ? processArgv(pid) : null
  return argv && !isDevStarter(argv) ? null : { port, pid }
}

const isDevStarter = (argv) => argv.some((arg) => /(?:^|\/)scripts\/dev\.cjs$/.test(arg))

// why: a refused connection means the holder just released the port, so the walk restarts.
function probe(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1")
    let reply = ""
    const finish = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(LOCK_PROBE_MS, () => finish("silent"))
    socket.on("data", (chunk) => {
      reply += chunk
      if (reply.length >= LOCK_TOKEN.length)
        finish(reply.startsWith(LOCK_TOKEN) ? "token" : "other")
    })
    socket.on("end", () => finish(reply === LOCK_TOKEN ? "token" : "other"))
    socket.on("error", (error) => finish(error.code === "ECONNREFUSED" ? "refused" : "other"))
  })
}

function listenerPid(port) {
  if (process.platform !== "linux") {
    const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpn"], {
      encoding: "utf8",
    }).stdout
    return lsofLockListener(lsof ?? "", port)
  }
  const tables = ["/proc/net/tcp", "/proc/net/tcp6"].map((table) => readFile(table)?.toString())
  const inode = lockListenerInode(tables.join("\n"), port)
  if (!inode) return null
  const socket = `socket:[${inode}]`
  for (const pid of fs.readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
    let fds = []
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`)
    } catch {
      continue
    }
    if (fds.some((fd) => readLink(`/proc/${pid}/fd/${fd}`) === socket)) return Number(pid)
  }
  return null
}

const TCP_LISTEN = "0A"
// why: these are 127.0.0.1, 0.0.0.0, ::, and ::ffff:127.0.0.1 as /proc/net/tcp{,6} print them, the only listeners that conflict with the lock's bind.
const LOCK_CONFLICT_ADDRESSES = new Set([
  "0100007F",
  "00000000",
  "00000000000000000000000000000000",
  "0000000000000000FFFF00000100007F",
])

function lockListenerInode(tables, port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0")
  for (const line of tables.split("\n")) {
    const fields = line.trim().split(/\s+/)
    const [address, localPort] = fields[1]?.split(":") ?? []
    if (localPort === hexPort && fields[3] === TCP_LISTEN && LOCK_CONFLICT_ADDRESSES.has(address))
      return fields[9]
  }
  return null
}

function lsofLockListener(output, port) {
  const conflicting = new Set([`127.0.0.1:${port}`, `*:${port}`, `[::ffff:127.0.0.1]:${port}`])
  let pid = null
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1))
    else if (line.startsWith("n") && conflicting.has(line.slice(1))) return pid
  }
  return null
}

function processArgv(pid) {
  if (process.platform === "linux")
    return readFile(`/proc/${pid}/cmdline`)?.toString().split("\0").slice(0, -1) ?? null
  const command = spawnSync("ps", ["-o", "command=", "-p", String(pid)], {
    encoding: "utf8",
  }).stdout?.trim()
  return command ? command.split(/\s+/) : null
}

/** why: a starter that is still alive may not have spawned Metro or convex dev yet, so its record is the only sign that this worktree is taken. */
async function planStart({ records, processes, worktree, deployment, isFree }) {
  const running = records.find((record) => record.worktree === worktree)
  if (running)
    throw new Error(
      `pnpm start is already running in this worktree (pid ${running.pid}); stop it first`,
    )
  const owner = convexOwner(processes, records, worktree, deployment)
  const port = await pickPort(isFree, new Set(records.map((record) => record.port)))
  return { owner, port }
}

const recordFile = (worktree) =>
  path.join(
    stateDir,
    `${path.basename(worktree)}-${createHash("sha256").update(worktree).digest("hex").slice(0, 8)}.json`,
  )

/** why: a crashed run leaves its record behind. Only a caller holding the lock may prune, so a record mid-rename or a live claim is never deleted by a racing start. */
function liveRecords(dir = stateDir, { prune = false } = {}) {
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  if (prune) removeOldTempRecords(dir, names)
  return names
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const file = path.join(dir, name)
      const record = parseRecord(readFile(file))
      if (record && processInfo(record.pid)?.identity === record.identity) return [record]
      if (prune) fs.rmSync(file, { force: true })
      return []
    })
}

function removeOldTempRecords(dir, names) {
  for (const name of names.filter((entry) => entry.endsWith(".tmp"))) {
    const file = path.join(dir, name)
    const age = Date.now() - (fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? Date.now())
    if (age > TEMP_RECORD_MAX_AGE_MS) fs.rmSync(file, { force: true })
  }
}

function parseRecord(content) {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// why: readers outside the lock must never see a half-written record, so write a temp file and rename it into place.
function writeRecord(record) {
  fs.mkdirSync(stateDir, { recursive: true })
  const { identity } = processInfo(process.pid) ?? {}
  const file = recordFile(record.worktree)
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify({ ...record, pid: process.pid, identity })}\n`)
  fs.renameSync(temp, file)
}

function removeRecord(worktree) {
  const file = recordFile(worktree)
  if (parseRecord(readFile(file))?.pid === process.pid) fs.rmSync(file, { force: true })
}

module.exports = {
  LOCK_TOKEN,
  DEFAULT_METRO_PORT,
  convexEnv,
  convexOwner,
  devDeployment,
  devKind,
  devProcesses,
  expoEnv,
  isPortFree,
  liveRecords,
  lockListenerInode,
  lsofLockListener,
  needsInstall,
  parseEnv,
  pickPort,
  planStart,
  processInfo,
  readFile,
  removeRecord,
  scanDevProcesses,
  stateDir,
  stopProcesses,
  withLock,
  writeRecord,
}
