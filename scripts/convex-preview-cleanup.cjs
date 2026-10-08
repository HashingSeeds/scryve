/**
 * why: previews count against the team's deployment cap until Convex expires them 5 days after
 * creation, so this deletes them once their branch is done. Run by the convex preview cleanup
 * workflow; pass --dry-run to only list stale previews.
 */
const CONVEX_API = "https://api.convex.dev/v1"
const GITHUB_API = "https://api.github.com"

/** why: main and production use staging or prod, so a preview for them came from a build that raced a newer merge. */
const PERMANENT_BRANCHES = new Set(["main", "production"])

function isStale({ branch, branchExists, prStates }) {
  if (PERMANENT_BRANCHES.has(branch)) return true
  if (!branchExists) return true
  return prStates.length > 0 && !prStates.includes("open")
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

  for (const { name, previewIdentifier: branch } of previews) {
    if (!branch) continue
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

module.exports = { isStale }
