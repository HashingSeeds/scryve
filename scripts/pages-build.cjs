const { spawnSync } = require("node:child_process")
const path = require("node:path")

const root = path.join(path.dirname(require.resolve("./pages-build.cjs")), "..")
const convex = path.join(root, "node_modules", ".bin", "convex")
// why: nothing in convex/ imports from outside it, so these paths are everything `convex deploy` bundles.
const BACKEND_PATHS = ["convex", "package.json", "pnpm-lock.yaml"]

function deployTarget(env, backendMatchesMain) {
  const branch = env.CF_PAGES_BRANCH
  // why: `production` trails main, and the beta workflow already deployed main's newer backend.
  if (branch === "production") return "none"
  const stagingKey = env.CONVEX_STAGING_DEPLOY_KEY
  if (!branch || !stagingKey || !backendMatchesMain()) return "default"
  if (!stagingKey.startsWith("dev:"))
    throw new Error("CONVEX_STAGING_DEPLOY_KEY must be a dev deployment key")
  return "staging"
}

// why: Pages clones shallowly, so compare tree tips instead of a merge base. Any git failure falls back to a per-branch preview.
function backendMatchesMain() {
  const git = (args) =>
    spawnSync("git", args, { cwd: root, stdio: ["ignore", "ignore", "inherit"] }).status
  if (git(["fetch", "--no-tags", "--depth=1", "origin", "main"]) !== 0) {
    console.warn("Could not fetch main, so this build gets its own Convex preview")
    return false
  }
  return git(["diff", "--quiet", "FETCH_HEAD", "HEAD", "--", ...BACKEND_PATHS]) === 0
}

function main() {
  const target = deployTarget(process.env, backendMatchesMain)
  if (target === "none") {
    if (!process.env.EXPO_PUBLIC_CONVEX_URL)
      throw new Error("Set EXPO_PUBLIC_CONVEX_URL in the Pages Production environment")
    const result = spawnSync("pnpm", ["build:web:pages"], { cwd: root, stdio: "inherit" })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
    return
  }
  const env =
    target === "staging"
      ? { ...process.env, CONVEX_DEPLOY_KEY: process.env.CONVEX_STAGING_DEPLOY_KEY }
      : process.env
  if (target === "staging") console.log("Backend matches main, deploying to shared staging")
  const result = spawnSync(
    convex,
    ["deploy", "--cmd", "pnpm build:web:pages", "--cmd-url-env-var-name", "EXPO_PUBLIC_CONVEX_URL"],
    { cwd: root, env, stdio: "inherit" },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { deployTarget }
