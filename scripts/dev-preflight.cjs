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

const stateDir = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
  "scryve-dev",
)

// why: pnpm keeps a copy of the lockfile it last installed, so a byte comparison tells whether this worktree's install is stale without any state of our own.
function needsInstall(lockfile, installedLockfile) {
  if (!lockfile) return false
  return !installedLockfile || !lockfile.equals(installedLockfile)
}

// why: match the node process itself, not shells or editors that merely mention the command.
const METRO = /^\S*node\s+\S*(?:\.bin\/expo|expo\/bin\/cli)\s+start(?:\s|$)/
const CONVEX = /^\S*node\s+\S*(?:\.bin\/convex|convex\/bin\/main\.js)\s+dev(?:\s|$)/

function devProcesses(psOutput) {
  return psOutput.split("\n").flatMap((line) => {
    const [, pid, command] = line.match(/^\s*(\d+)\s+(.*)$/) ?? []
    if (!pid) return []
    const kind = METRO.test(command) ? "metro" : CONVEX.test(command) ? "convex" : null
    return kind ? [{ pid: Number(pid), kind }] : []
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
  if (convexEnv.CONVEX_DEPLOY_KEY)
    return { error: "CONVEX_DEPLOY_KEY is set, so convex dev would not use the dev deployment." }
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

function convexOwner(processes, worktree, deployment) {
  return processes.find(
    (proc) => proc.kind === "convex" && proc.cwd !== worktree && proc.deployment === deployment,
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

function cwds(pids) {
  if (pids.length === 0) return new Map()
  if (process.platform === "linux")
    return new Map(pids.map((pid) => [pid, readLink(`/proc/${pid}/cwd`)]))
  const out = spawnSync("lsof", ["-a", "-d", "cwd", "-Fn", "-p", pids.join(",")], {
    encoding: "utf8",
  }).stdout
  const found = new Map()
  let pid = null
  for (const line of out?.split("\n") ?? []) {
    if (line.startsWith("p")) pid = Number(line.slice(1))
    else if (line.startsWith("n") && pid) found.set(pid, line.slice(1))
  }
  return found
}

function readLink(link) {
  try {
    return fs.readlinkSync(link)
  } catch {
    return null
  }
}

// why: spawning ps costs 50 ms or more on a busy Linux box, while reading /proc directly takes about 10 ms.
function processTable() {
  if (process.platform !== "linux")
    return spawnSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" }).stdout ?? ""
  return fs
    .readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .map((pid) => `${pid} ${readFile(`/proc/${pid}/cmdline`)?.toString().replaceAll("\0", " ")}`)
    .join("\n")
}

function scanDevProcesses() {
  const found = devProcesses(processTable()).filter((proc) => proc.pid !== process.pid)
  const dirs = cwds(found.map((proc) => proc.pid))
  return found.map((proc) => {
    const cwd = dirs.get(proc.pid) ?? null
    const deployment =
      proc.kind === "convex" && cwd
        ? convexEnv(cwd).CONVEX_DEPLOYMENT?.match(/^dev:(.+)$/)?.[1]
        : undefined
    return { ...proc, cwd, deployment }
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

async function stopProcesses(pids) {
  for (const pid of pids) signal(pid, "SIGTERM")
  const deadline = Date.now() + STOP_WAIT_MS
  while (pids.some(isAlive) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
  for (const pid of pids.filter(isAlive)) signal(pid, "SIGKILL")
}

function signal(pid, name) {
  try {
    process.kill(pid, name)
  } catch (error) {
    if (error.code !== "ESRCH") throw error
  }
}

const recordFile = (worktree) =>
  path.join(
    stateDir,
    `${path.basename(worktree)}-${createHash("sha256").update(worktree).digest("hex").slice(0, 8)}.json`,
  )

/** why: a crashed run leaves its record behind, so records with dead pids are pruned instead of reserving their port forever. */
function liveRecords() {
  const names = fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : []
  return names.flatMap((name) => {
    const file = path.join(stateDir, name)
    try {
      const record = JSON.parse(fs.readFileSync(file, "utf8"))
      if (isAlive(record.pid)) return [record]
    } catch {}
    fs.rmSync(file, { force: true })
    return []
  })
}

function writeRecord(record) {
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(recordFile(record.worktree), `${JSON.stringify(record)}\n`)
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
  devProcesses,
  expoEnv,
  isPortFree,
  liveRecords,
  needsInstall,
  parseEnv,
  pickPort,
  readFile,
  removeRecord,
  scanDevProcesses,
  stateDir,
  stopProcesses,
  writeRecord,
}
