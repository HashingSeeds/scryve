/**
 * why: a version belongs to one commit. `v<version>` tags the commit that built it, so the
 * other platform or a retried build reuses it, and a newer commit of main bumps the patch.
 * An untagged version is used as is, which is how hand-set minor and major bumps ship.
 *
 *   node scripts/release-native.cjs version   settle this commit's version (prod build scripts run this)
 *   node scripts/release-native.cjs cloud     settle the version, then build both platforms on EAS and submit
 */
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(path.dirname(require.resolve("./release-native.cjs")), "..")
const packageJsonPath = path.join(root, "package.json")
const MAIN = "origin/main"

const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`package.json version ${version} is not major.minor.patch`)
  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

/** why: `taggedCommit` is the commit `v<version>` points at, or null before that tag exists. */
function planVersion({ version, taggedCommit, head }) {
  if (taggedCommit === head) return { action: "reuse", version }
  if (taggedCommit === null) return { action: "tag", version }
  return { action: "bump", version: bumpPatch(version) }
}

function tagCommit(tag) {
  try {
    return git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`)
  } catch {
    return null
  }
}

function isAncestor(commit, ref) {
  try {
    git("merge-base", "--is-ancestor", commit, ref)
    return true
  } catch {
    return false
  }
}

function readVersion() {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version
}

function writeVersion(version) {
  const source = fs.readFileSync(packageJsonPath, "utf8")
  const next = source.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`)
  if (next === source) throw new Error("Could not find the version in package.json")
  fs.writeFileSync(packageJsonPath, next)
}

function settleVersion() {
  if (git("status", "--porcelain")) throw new Error("Commit or stash your changes first.")
  // why: origin owns release tags; a stale local tag would otherwise make every fetch fail.
  git("fetch", "--quiet", "--force", "--tags", "origin", "main")

  const head = git("rev-parse", "HEAD")
  const current = readVersion()
  const plan = planVersion({ version: current, taggedCommit: tagCommit(`v${current}`), head })
  const tag = `v${plan.version}`

  if (plan.action === "reuse") {
    // why: a run interrupted before its push leaves the bump commit and tag only on this machine.
    const onMain = isAncestor(head, MAIN)
    try {
      if (onMain) git("push", "--quiet", "origin", `refs/tags/${tag}`)
      else git("push", "--quiet", "--atomic", "origin", "HEAD:refs/heads/main", `refs/tags/${tag}`)
    } catch (error) {
      throw new Error(
        `Could not publish ${tag}. If main moved, run \`git tag -d ${tag}\`, reset to ${MAIN}, and run again.`,
        { cause: error },
      )
    }
    console.log(
      onMain
        ? `Reusing ${tag}, which this commit already built.`
        : `Published ${tag} and reused it.`,
    )
    return plan.version
  }

  if (head !== git("rev-parse", MAIN))
    throw new Error(`Release from ${MAIN}'s tip. Check it out (or pull) and run again.`)

  if (plan.action === "bump") {
    if (tagCommit(tag)) throw new Error(`${tag} already exists. Set package.json past it on main.`)
    writeVersion(plan.version)
    git("commit", "--quiet", "-m", `chore(release): ${tag} [skip ci]`, "--", "package.json")
  }
  git("tag", "-a", tag, "-m", tag)

  try {
    git("push", "--quiet", "--atomic", "origin", "HEAD:refs/heads/main", `refs/tags/${tag}`)
  } catch (error) {
    // why: a local tag or bump commit left behind would make the rerun after pulling reuse it.
    git("tag", "-d", tag)
    if (plan.action === "bump") git("reset", "--quiet", "--keep", "HEAD~1")
    throw new Error(
      `Could not push ${tag}. If main moved, pull and run again; git says why above.`,
      {
        cause: error,
      },
    )
  }
  console.log(plan.action === "bump" ? `Bumped to ${tag}.` : `Tagged ${tag}.`)
  return plan.version
}

function main() {
  const [command] = process.argv.slice(2)
  if (command === "version") return void settleVersion()
  if (command === "cloud") {
    const version = settleVersion()
    console.log(`Building ${version} for iOS and Android on EAS.`)
    execFileSync(
      "npx",
      [
        "--yes",
        "eas-cli@latest",
        "build",
        "--profile",
        "production",
        "--platform",
        "all",
        "--auto-submit",
      ],
      { cwd: root, stdio: "inherit" },
    )
    return
  }
  throw new Error("Usage: release-native.cjs version | cloud")
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { bumpPatch, planVersion }
