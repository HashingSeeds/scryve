const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(path.dirname(require.resolve("./convex-backend.cjs")), "..")
// why: convex/ imports nothing outside it and only convex.json can relocate it, so these are everything `convex deploy` bundles.
const BACKEND_PATHS = ["convex", "convex.json", "pnpm-lock.yaml"]

// why: every native release bumps `version` on main, which would otherwise count as a backend change.
function packageJsonMatches(baseSource, headSource) {
  const withoutVersion = (source) => {
    const { version: _version, ...rest } = JSON.parse(source)
    return JSON.stringify(rest)
  }
  try {
    return withoutVersion(baseSource) === withoutVersion(headSource)
  } catch {
    return false
  }
}

/** why: true only when git proves the backends are identical; any git failure counts as a change. */
function backendMatches(baseRef, headRef, cwd = root) {
  const diff = spawnSync("git", ["diff", "--quiet", baseRef, headRef, "--", ...BACKEND_PATHS], {
    cwd,
    stdio: ["ignore", "ignore", "inherit"],
  })
  if (diff.status !== 0) return false
  const packageJsonAt = (ref) =>
    spawnSync("git", ["show", `${ref}:package.json`], { cwd, encoding: "utf8" }).stdout
  return packageJsonMatches(packageJsonAt(baseRef), packageJsonAt(headRef))
}

/**
 * why: beta runs one at a time, so the finished run that started last is the last one that could
 * have deployed, even when it re-ran an older commit. Only a success proves production runs its
 * commit's backend: a failed or cancelled run may have deployed and then stopped.
 */
function betaDeployDecision(finishedRuns, matches) {
  const [lastRun] = finishedRuns.toSorted((a, b) =>
    b.run_started_at.localeCompare(a.run_started_at),
  )
  if (!lastRun) return { deploy: true, reason: "no finished beta run to compare against" }
  const sha = lastRun.head_sha
  if (lastRun.conclusion !== "success")
    return { deploy: true, reason: `the last beta run (${sha}) ended ${lastRun.conclusion}` }
  if (!matches(sha)) return { deploy: true, reason: `the backend changed since ${sha}` }
  return { deploy: false, reason: `the backend matches ${sha}, which the last beta run shipped` }
}

// why: the API lists runs by creation, so a re-run of an older one can sit below newer runs.
async function finishedBetaRuns({ GITHUB_REPOSITORY, GITHUB_TOKEN }) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/beta.yml/runs?branch=main&status=completed&per_page=100`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } },
  )
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`)
  return (await response.json()).workflow_runs
}

async function main() {
  const runs = await finishedBetaRuns(process.env).catch((error) => {
    console.warn(`Could not look up the last beta run: ${error.message}`)
    return []
  })
  const { deploy, reason } = betaDeployDecision(runs, (sha) => backendMatches(sha, "HEAD"))
  console.log(`${deploy ? "Deploying" : "Skipping the deploy"}: ${reason}`)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { backendMatches, betaDeployDecision, packageJsonMatches }
