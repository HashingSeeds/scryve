const assert = require("node:assert/strict")
const { Buffer } = require("node:buffer")
const { test } = require("node:test")

const {
  convexOwner,
  devDeployment,
  devProcesses,
  needsInstall,
  parseEnv,
  pickPort,
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
  const ps = [
    "  101 node /w/a/node_modules/.bin/expo start --dev-client --port 8081",
    "  102 node /w/a/node_modules/.bin/convex dev",
    "  103 /usr/bin/node /w/b/node_modules/expo/bin/cli start",
    "  104 node /w/b/node_modules/convex/bin/main.js dev --once",
    "  105 node /w/a/node_modules/.bin/expo export --platform web",
    "  106 node /w/a/node_modules/.bin/convex deploy",
    "  107 zsh -c pnpm start && node /w/a/node_modules/.bin/expo start",
    "  108 node scripts/dev.cjs",
  ].join("\n")
  assert.deepEqual(devProcesses(ps), [
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
  assert.equal(convexOwner(processes, "/w/b", "dev-otter")?.pid, 2)
  assert.equal(convexOwner(processes, "/w/a", "dev-otter"), undefined)
  assert.equal(convexOwner(processes, "/w/b", "dev-heron"), undefined)
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
