const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { after, test } = require("node:test")

const root = path.join(path.dirname(require.resolve("./tsrs-as-tsgo.test.cjs")), "..")
const convexCli = path.join(root, "node_modules", "convex", "bin", "main.js")
const projects = []
after(() => projects.forEach((cwd) => fs.rmSync(cwd, { recursive: true })))

function convexProject(functionSource) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tsrs-as-tsgo-"))
  projects.push(cwd)
  fs.symlinkSync(path.join(root, "node_modules"), path.join(cwd, "node_modules"))
  fs.copyFileSync(path.join(root, "convex.json"), path.join(cwd, "convex.json"))
  const { version } = require(path.join(root, "node_modules", "convex", "package.json"))
  fs.writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({ name: "fixture", private: true, dependencies: { convex: version } }),
  )
  fs.mkdirSync(path.join(cwd, "convex"))
  fs.writeFileSync(
    path.join(cwd, "convex", "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true } }),
  )
  fs.writeFileSync(path.join(cwd, "convex", "probe.ts"), functionSource)
  return cwd
}

function convexTypecheck(cwd) {
  const env = { ...process.env, CONVEX_DEPLOYMENT: "", CONVEX_DEPLOY_KEY: "" }
  return spawnSync(process.execPath, [convexCli, "typecheck"], { cwd, env, encoding: "utf8" })
}

test("Convex typechecks through tsrs and passes clean functions", () => {
  const result = convexTypecheck(convexProject("export const answer: number = 42\n"))
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout + result.stderr, /Typecheck passed: `tsgo/)
})

test("Convex typechecks through tsrs and fails on a type error", () => {
  const result = convexTypecheck(convexProject('export const answer: number = "42"\n'))
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /probe\.ts/)
})
