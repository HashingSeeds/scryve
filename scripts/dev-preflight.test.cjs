const assert = require("node:assert/strict")
const { Buffer } = require("node:buffer")
const { spawn, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { setTimeout } = require("node:timers/promises")

const {
  convexOwner,
  devDeployment,
  devProcesses,
  needsInstall,
  parseEnv,
  pickPort,
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

test("the lock lets one start in at a time", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-dev-lock-"))
  try {
    let inside = 0
    let overlapped = false
    const hold = () =>
      withLock(dir, async () => {
        inside++
        overlapped ||= inside > 1
        await setTimeout(50)
        inside--
      })
    await Promise.all([hold(), hold()])
    assert.equal(overlapped, false)
    assert.equal(fs.existsSync(path.join(dir, "lock")), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("a lock left by a dead start is taken over", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-dev-lock-"))
  try {
    const deadPid = spawnSync(process.execPath, ["-e", ""]).pid
    fs.writeFileSync(path.join(dir, "lock"), String(deadPid))
    assert.equal(await withLock(dir, async () => "acquired", 200), "acquired")

    fs.writeFileSync(path.join(dir, "lock"), String(process.pid))
    await assert.rejects(
      withLock(dir, async () => "acquired", 100),
      /Another pnpm start holds/,
    )
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
