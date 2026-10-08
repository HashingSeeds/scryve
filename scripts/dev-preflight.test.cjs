const assert = require("node:assert/strict")
const { Buffer } = require("node:buffer")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { setTimeout } = require("node:timers/promises")

const {
  LOCK_TOKEN,
  convexOwner,
  devDeployment,
  devProcesses,
  needsInstall,
  parseEnv,
  liveRecords,
  lockListenerInode,
  lsofLockListener,
  pickPort,
  planStart,
  processInfo,
  stopProcesses,
  withLock,
} = require("./dev-preflight.cjs")

test("install runs only when the lockfile differs from the last installed copy", () => {
  const lock = Buffer.from("lockfileVersion: '9.0'\nfoo: 1\n")
  assert.equal(needsInstall(lock, Buffer.from(lock)), false)
  assert.equal(needsInstall(lock, Buffer.from("lockfileVersion: '9.0'\nfoo: 2\n")), true)
  assert.equal(needsInstall(lock, null), true)
  assert.equal(needsInstall(null, null), false)
})

test("port pick skips busy and reserved ports", async () => {
  const busy = new Set([8081, 8082])
  const isFree = async (port) => !busy.has(port)
  assert.equal(await pickPort(async () => true), 8081)
  assert.equal(await pickPort(isFree), 8083)
  assert.equal(await pickPort(isFree, new Set([8083])), 8084)
  await assert.rejects(
    pickPort(async () => false),
    /No free Metro port/,
  )
})

test("only the node processes behind Metro and convex dev count", () => {
  const rows = [
    ["node", "/w/a/node_modules/.bin/expo", "start", "--dev-client", "--port", "8081"],
    ["node", "/w/a/node_modules/.bin/convex", "dev"],
    ["/usr/bin/node", "--max-old-space-size=4096", "/w/b/node_modules/expo/bin/cli", "start"],
    ["node", "/My Projects/scryve/node_modules/convex/bin/main.js", "dev", "--once"],
    ["node", "/w/a/node_modules/.bin/expo", "export", "--platform", "web"],
    ["node", "/w/a/node_modules/.bin/convex", "deploy"],
    ["zsh", "-c", "pnpm start && node /w/a/node_modules/.bin/expo start"],
    ["node", "scripts/dev.cjs"],
  ].map((argv, index) => ({ pid: 101 + index, argv }))
  assert.deepEqual(devProcesses(rows), [
    { pid: 101, kind: "metro" },
    { pid: 102, kind: "convex" },
    { pid: 103, kind: "metro" },
    { pid: 104, kind: "convex" },
  ])
})

test("a second worktree defers to the convex dev already pushing its deployment", () => {
  const processes = [
    { pid: 1, kind: "metro", cwd: "/w/a" },
    { pid: 2, kind: "convex", cwd: "/w/a", deployment: "dev-otter" },
    { pid: 3, kind: "convex", cwd: "/w/c", deployment: "other-dev" },
  ]
  assert.equal(convexOwner(processes, [], "/w/b", "dev-otter")?.pid, 2)
  assert.equal(convexOwner(processes, [], "/w/a", "dev-otter"), undefined)
  assert.equal(convexOwner(processes, [], "/w/b", "dev-heron"), undefined)
})

test("a record claims the deployment before its convex dev process exists", () => {
  const claim = { worktree: "/w/a", pid: 9, deployment: "dev-otter", convex: true, port: 8081 }
  assert.deepEqual(convexOwner([], [claim], "/w/b", "dev-otter"), {
    cwd: "/w/a",
    pid: 9,
    deployment: "dev-otter",
  })
  assert.equal(convexOwner([], [{ ...claim, convex: false }], "/w/b", "dev-otter"), undefined)
})

const lockPort = 18_500 + (process.pid % 400)
const lockPorts = [lockPort, lockPort + 1]

const listenIn = (script) => {
  const proc = spawn(process.execPath, ["-e", script])
  return new Promise((resolve) => proc.stdout.once("data", () => resolve(proc)))
}

const holdTogether = async (ports) => {
  let inside = 0
  let overlapped = false
  const hold = () =>
    withLock(
      async () => {
        inside++
        overlapped ||= inside > 1
        await setTimeout(50)
        inside--
      },
      { ports },
    )
  await Promise.all([hold(), hold(), hold()])
  return overlapped
}

test("the lock lets one start in at a time", async () => {
  assert.equal(await holdTogether(lockPorts), false)
})

test("an unrelated app on the first lock port neither blocks starts nor lets them overlap", async () => {
  const silent = await listenIn(
    `require("node:net").createServer(() => {}).listen(${lockPort}, "127.0.0.1", () => console.log("up"))`,
  )
  try {
    assert.equal(await withLock(async () => "acquired", { ports: lockPorts }), "acquired")
    assert.equal(await holdTogether(lockPorts), false)
    await assert.rejects(
      withLock(async () => "acquired", { ports: [lockPort] }),
      /used by another app\. Set SCRYVE_DEV_LOCK_PORT=/,
    )
  } finally {
    silent.kill("SIGKILL")
  }
})

test("a holder whose event loop is blocked never lets a second start in", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-dev-busy-"))
  fs.mkdirSync(path.join(dir, "scripts"))
  const starter = path.join(dir, "scripts", "dev.cjs")
  fs.writeFileSync(
    starter,
    `require(${JSON.stringify(require.resolve("./dev-preflight.cjs"))}).withLock(() => {
      console.log("held")
      const end = Date.now() + 1500
      while (Date.now() < end) {}
    }, { ports: ${JSON.stringify(lockPorts)} })`,
  )
  const holder = spawn(process.execPath, [starter])
  try {
    await new Promise((resolve) => holder.stdout.once("data", resolve))
    const heldAt = Date.now()
    await assert.rejects(
      withLock(async () => "acquired", { ports: lockPorts, waitMs: 300 }),
      new RegExp(`Lock port ${lockPort} has been held by pid ${holder.pid}`),
    )
    await withLock(async () => "acquired", { ports: lockPorts, waitMs: 5000 })
    assert.ok(Date.now() - heldAt >= 1400, "entered while the busy holder still held the lock")
  } finally {
    holder.kill("SIGKILL")
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("the owner lookup only considers listeners that conflict with 127.0.0.1", () => {
  const row = (address, state, inode) =>
    `   0: ${address}:4E20 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000  1000        0 ${inode} 1`
  const header =
    "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode"
  const tables = (...rows) => [header, ...rows].join("\n")
  assert.equal(
    lockListenerInode(
      tables(row("0200007F", "0A", 111), row("0100007F", "01", 222), row("0100007F", "0A", 333)),
      20000,
    ),
    "333",
  )
  assert.equal(lockListenerInode(tables(row("00000000", "0A", 444)), 20000), "444")
  assert.equal(
    lockListenerInode(tables(row("00000000000000000000000000000000", "0A", 555)), 20000),
    "555",
  )
  assert.equal(lockListenerInode(tables(row("0200007F", "0A", 111)), 20000), null)

  const lsof = (name) => `p11\nf5\nn127.0.0.2:20000\np22\nf6\nn${name}`
  assert.equal(lsofLockListener(lsof("127.0.0.1:20000"), 20000), 22)
  assert.equal(lsofLockListener(lsof("*:20000"), 20000), 22)
  assert.equal(lsofLockListener(lsof("[::1]:20000"), 20000), null)
})

test("a killed lock holder frees the lock", async () => {
  const holder = await listenIn(
    `require("node:net").createServer((s) => s.end(${JSON.stringify(LOCK_TOKEN)})).listen(${lockPort}, "127.0.0.1", () => console.log("held"))`,
  )
  try {
    await assert.rejects(
      withLock(async () => "acquired", { ports: lockPorts, waitMs: 100 }),
      /Lock port \d+ has been held by pid \d+/,
    )
    holder.kill("SIGKILL")
    assert.equal(await withLock(async () => "acquired", { ports: lockPorts }), "acquired")
  } finally {
    holder.kill("SIGKILL")
  }
})

test("a second start in the same worktree is refused while the first is alive", async () => {
  const first = { worktree: "/w/a", pid: 7, port: 8081, deployment: "dev-otter", convex: true }
  const plan = { processes: [], deployment: "dev-otter", isFree: async () => true }
  await assert.rejects(
    planStart({ ...plan, records: [first], worktree: "/w/a" }),
    /already running in this worktree \(pid 7\)/,
  )
  assert.deepEqual(await planStart({ ...plan, records: [first], worktree: "/w/b" }), {
    owner: { cwd: "/w/a", pid: 7, deployment: "dev-otter" },
    port: 8082,
  })
})

test("records survive only while their pid still names the starter, and only the lock holder prunes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-dev-records-"))
  try {
    const { identity } = processInfo(process.pid)
    const record = { worktree: "/w/a", pid: process.pid, port: 8081 }
    fs.writeFileSync(path.join(dir, "live.json"), JSON.stringify({ ...record, identity }))
    fs.writeFileSync(path.join(dir, "reused.json"), JSON.stringify({ ...record, identity: "x" }))
    fs.writeFileSync(path.join(dir, "partial.json"), '{"worktree":"/w/b","po')
    fs.writeFileSync(path.join(dir, "fresh.json.1.tmp"), "{")
    fs.writeFileSync(path.join(dir, "old.json.2.tmp"), "{")
    const twoMinutesAgo = new Date(Date.now() - 120_000)
    fs.utimesSync(path.join(dir, "old.json.2.tmp"), twoMinutesAgo, twoMinutesAgo)
    const kept = (options) => liveRecords(dir, options).map((live) => live.identity)
    assert.deepEqual(kept(), [identity])
    assert.equal(fs.readdirSync(dir).length, 5)
    assert.deepEqual(kept({ prune: true }), [identity])
    assert.deepEqual(fs.readdirSync(dir).sort(), ["fresh.json.1.tmp", "live.json"])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("stopping skips a pid that no longer names the process that was found", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"])
  try {
    const found = { pid: child.pid, identity: processInfo(child.pid).identity }
    await stopProcesses([found], () => ({ identity: "a different process" }))
    assert.equal(child.exitCode, null)
    assert.equal(child.signalCode, null)

    await stopProcesses([found])
    await setTimeout(50)
    assert.equal(child.signalCode, "SIGTERM")
  } finally {
    child.kill("SIGKILL")
  }
})

test("start refuses anything but the dev deployment", () => {
  const dev = { CONVEX_DEPLOYMENT: "dev:fond-otter-86" }
  assert.deepEqual(devDeployment(dev, {}), { deployment: "fond-otter-86" })
  assert.deepEqual(
    devDeployment(dev, { EXPO_PUBLIC_CONVEX_URL: "https://fond-otter-86.convex.cloud/" }),
    { deployment: "fond-otter-86" },
  )
  assert.match(devDeployment({ CONVEX_DEPLOYMENT: "prod:fond-otter-86" }, {}).error, /prod:/)
  assert.match(devDeployment({}, {}).error, /unset/)
  assert.match(
    devDeployment({ ...dev, CONVEX_DEPLOY_KEY: "prod:x|y" }, {}).error,
    /CONVEX_DEPLOY_KEY/,
  )
  assert.match(
    devDeployment({ ...dev, CONVEX_DEPLOYMENT_TOKEN: "prod:x|y" }, {}).error,
    /CONVEX_DEPLOYMENT_TOKEN/,
  )
  assert.match(
    devDeployment(dev, { EXPO_PUBLIC_CONVEX_URL: "https://preview-x.convex.cloud" }).error,
    /start:expo/,
  )
})

test("env files parse like dotenv", () => {
  assert.deepEqual(
    parseEnv(
      "# note\nCONVEX_DEPLOYMENT=dev:otter # team: me\nexport A='quoted # kept'\nB=\"x\"\n\nC=",
    ),
    { CONVEX_DEPLOYMENT: "dev:otter", A: "quoted # kept", B: "x", C: "" },
  )
})
