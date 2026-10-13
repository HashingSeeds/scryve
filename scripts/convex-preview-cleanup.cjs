const { previewName } = require("./preview.cjs")

const CONVEX_API = "https://api.convex.dev/v1"
const GITHUB_API = "https://api.github.com"

/** why: main and production use staging or prod, so a preview for them came from a build that raced a newer merge. */
const PERMANENT_BRANCHES = new Set(["main", "production"])

function isStale({ branch, branchExists, prStates }) {
  if (PERMANENT_BRANCHES.has(branch)) return true
  if (!branchExists) return true
  return prStates.length > 0 && !prStates.includes("open")
}

/** why: `pnpm preview:up` names previews `<slug>-<hash>`, which is not a branch, so the sweep deleted every one of them. */
function branchForPreview(identifier, branches) {
  return branches.find((branch) => previewName(branch) === identifier) ?? identifier
}

async function request(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...init.headers },
  })
  if (!response.ok && response.status !== 404)
    throw new Error(
      `${init.method ?? "GET"} ${url} failed: ${response.status} ${await response.text()}`,
    )
  return response
}

async function listBranches(repo, token) {
  const branches = []
  for (let page = 1; ; page++) {
    const response = await request(
      `${GITHUB_API}/repos/${repo}/branches?per_page=100&page=${page}`,
      token,
    )
    const batch = await response.json()
    branches.push(...batch.map(({ name }) => name))
    if (batch.length < 100) return branches
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const convexToken = process.env.CONVEX_TEAM_TOKEN
  const projectId = process.env.CONVEX_PROJECT_ID
  const githubToken = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!convexToken || !projectId || !githubToken || !repo)
    throw new Error("Set CONVEX_TEAM_TOKEN, CONVEX_PROJECT_ID, GITHUB_TOKEN, and GITHUB_REPOSITORY")
  const owner = repo.split("/")[0]

  const listing = await request(
    `${CONVEX_API}/projects/${projectId}/list_deployments?deploymentType=preview`,
    convexToken,
  )
  const previews = await listing.json()
  const branches = await listBranches(repo, githubToken)

  for (const { name, deploymentType, projectId: owningProject, previewIdentifier } of previews) {
    /** why: the token can delete prod and staging too, so never trust the listing filter alone. */
    if (deploymentType !== "preview" || String(owningProject) !== projectId || !previewIdentifier)
      continue
    const branch = branchForPreview(previewIdentifier, branches)
    const encoded = encodeURIComponent(branch)
    const branchResponse = await request(
      `${GITHUB_API}/repos/${repo}/branches/${encoded}`,
      githubToken,
    )
    const prResponse = await request(
      `${GITHUB_API}/repos/${repo}/pulls?state=all&per_page=100&head=${owner}:${encoded}`,
      githubToken,
    )
    const prs = await prResponse.json()
    const stale = isStale({
      branch,
      branchExists: branchResponse.status !== 404,
      prStates: prs.map((pr) => pr.state),
    })
    if (!stale) {
      console.log(`keep   ${name} (${branch})`)
      continue
    }
    console.log(`${dryRun ? "stale " : "delete"} ${name} (${branch})`)
    if (!dryRun)
      await request(`${CONVEX_API}/deployments/${name}/delete`, convexToken, { method: "POST" })
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { branchForPreview, isStale }
