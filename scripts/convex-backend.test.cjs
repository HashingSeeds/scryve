const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { after, test } = require("node:test")

const { backendMatches, betaDeployDecision, packageJsonMatches } = require("./convex-backend.cjs")

const repos = []
after(() => repos.forEach((cwd) => fs.rmSync(cwd, { recursive: true })))

function repoWithCommits(...commits) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "convex-backend-"))
  repos.push(cwd)
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
  git("-c", "init.defaultBranch=main", "init", "--quiet")
  fs.mkdirSync(path.join(cwd, "convex"))
  return commits.map((files) => {
    for (const [file, contents] of Object.entries(files))
      fs.writeFileSync(path.join(cwd, file), contents)
    git("add", "-A")
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "c")
    return { cwd, sha: git("rev-parse", "HEAD") }
  })
}

const pkg = (version, convex = "1.0.0") => JSON.stringify({ version, dependencies: { convex } })
const base = { "convex/games.ts": "a", "pnpm-lock.yaml": "a", "package.json": pkg("0.1.0") }

test("app-only changes and version bumps leave the backend matching", () => {
  const [first, last] = repoWithCommits(base, { "src.ts": "x", "package.json": pkg("0.1.1") })
  assert.equal(backendMatches(first.sha, last.sha, last.cwd), true)
})

test("a change to convex/, the lockfile, or package.json dependencies is a backend change", () => {
  for (const change of [
    { "convex/games.ts": "b" },
    { "pnpm-lock.yaml": "b" },
    { "package.json": pkg("0.1.0", "1.1.0") },
  ]) {
    const [first, last] = repoWithCommits(base, change)
    assert.equal(backendMatches(first.sha, last.sha, last.cwd), false)
  }
})

test("a commit git cannot find counts as a backend change", () => {
  const [only] = repoWithCommits(base)
  assert.equal(backendMatches("0".repeat(40), only.sha, only.cwd), false)
})

test("a version bump alone keeps package.json matching", () => {
  assert.equal(packageJsonMatches(pkg("0.1.2"), pkg("0.1.1")), true)
  assert.equal(packageJsonMatches(pkg("0.1.2", "1.1.0"), pkg("0.1.2")), false)
  assert.equal(packageJsonMatches("", pkg("0.1.2")), false)
})

const run = (head_sha, conclusion, run_started_at = "2026-10-09T10:00:00Z") => ({
  head_sha,
  conclusion,
  run_started_at,
})

test("beta skips the deploy only when the last successful run shipped the same backend", () => {
  assert.equal(betaDeployDecision([run("abc", "success")], () => true).deploy, false)
  assert.equal(betaDeployDecision([run("abc", "success")], () => false).deploy, true)
})

test("beta deploys without comparing when the last run is missing or did not succeed", () => {
  const unreachable = () => assert.fail("nothing proves which backend is live")
  assert.equal(betaDeployDecision([], unreachable).deploy, true)
  for (const conclusion of ["failure", "cancelled", "timed_out"])
    assert.equal(betaDeployDecision([run("abc", conclusion)], unreachable).deploy, true)
})

test("a re-run of an older commit is what production last received", () => {
  const runs = [
    run("newer", "success", "2026-10-09T10:00:00Z"),
    run("older", "success", "2026-10-09T11:00:00Z"),
  ]
  assert.equal(betaDeployDecision(runs, (sha) => sha === "older").deploy, false)
  assert.equal(betaDeployDecision(runs, (sha) => sha === "newer").deploy, true)
})
