const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { cliEnv, localCredentials, localDir } = require("./local-backend.cjs")

test("each worktree gets its own backend directory, and so its own backend name", () => {
  assert.notEqual(localDir("/w/scryve-a"), localDir("/w/scryve-b"))
  assert.equal(path.dirname(localDir("/w/scryve-a")), "/w/scryve-a/.convex")
})

test("the CLI never sees a deployment or deploy key from the shell", () => {
  assert.deepEqual(
    cliEnv({
      PATH: "/bin",
      CONVEX_DEPLOYMENT: "dev:x",
      CONVEX_DEPLOY_KEY: "preview:a:b|k",
      CONVEX_SELF_HOSTED_URL: "http://x",
    }),
    { PATH: "/bin" },
  )
})

test("bots use the backend only when this worktree's own backend answers on its port", async () => {
  using temp = fs.mkdtempDisposableSync(path.join(os.tmpdir(), "scryve-local-test-"))
  let name = "anonymous-scryve-other"
  const server = http.createServer((_, response) => response.end(name))
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  const state = path.join(temp.path, ".convex", "local", "default")
  fs.mkdirSync(state, { recursive: true })
  fs.writeFileSync(
    path.join(state, "config.json"),
    JSON.stringify({
      ports: { cloud: port, site: port + 1 },
      adminKey: "key",
      deploymentName: "anonymous-scryve-mine",
    }),
  )
  try {
    await assert.rejects(localCredentials(temp.path), /pnpm convex:local/)
    name = "anonymous-scryve-mine"
    assert.deepEqual(await localCredentials(temp.path), {
      url: `http://127.0.0.1:${port}`,
      siteUrl: `http://127.0.0.1:${port + 1}`,
      adminKey: "key",
      deploymentName: "anonymous-scryve-mine",
    })
  } finally {
    server.closeAllConnections()
    server.close()
  }
  await assert.rejects(localCredentials(path.join(temp.path, "missing")), /not running/)
})
