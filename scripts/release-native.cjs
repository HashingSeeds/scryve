const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = path.join(path.dirname(require.resolve("./release-native.cjs")), "..")
const packageJsonPath = path.join(root, "package.json")
const easCli = `eas-cli@${require(packageJsonPath).config.easCli}`
const MAIN = "origin/main"

const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()

const gh = (...args) =>
  execFileSync("gh", args, { cwd: root, stdio: ["ignore", "ignore", "inherit"] })

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`package.json version ${version} is not major.minor.patch`)
  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

function planVersion({ version, taggedCommit, head }) {
  if (taggedCommit === head) return { action: "reuse", version }
  if (taggedCommit === null) return { action: "tag", version }
  return { action: "bump", version: bumpPatch(version) }
}

// why: a build for a few testers cannot bump or tag main, and a tagged version may already be live, where the App Store turns away new builds of it.
const planOffMainVersion = ({ version, tagged }) => (tagged ? bumpPatch(version) : version)

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

// why: main only takes pull requests, so the bump lands as a self-merged PR before the tag.
function mergeBump(tag, base) {
  const branch = `release/${tag}`
  const title = `chore(release): ${tag} [skip ci]`
  writeVersion(tag.slice(1))
  git("commit", "--quiet", "-m", title, "--", "package.json")
  const bump = git("rev-parse", "HEAD")
  try {
    git("push", "--quiet", "--force", "origin", `HEAD:refs/heads/${branch}`)
    gh(
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      branch,
      "--title",
      title,
      "--body",
      `Bumps the app version to ${tag} for a native build.`,
    )
    gh(
      "pr",
      "merge",
      branch,
      "--squash",
      "--delete-branch",
      "--match-head-commit",
      bump,
      "--subject",
      title,
      "--body",
      "",
    )
  } catch (error) {
    throw new Error(`Could not merge the ${tag} bump. Close any open ${branch} PR and run again.`, {
      cause: error,
    })
  } finally {
    // why: the squash commit replaces the local bump, so a failure below still leaves a rerunnable checkout.
    git("reset", "--quiet", "--keep", base)
  }
  git("fetch", "--quiet", "origin", "main")
  const merged = git("rev-parse", MAIN)
  git("reset", "--quiet", "--keep", merged)
  if (git("rev-parse", `${merged}^`) !== base)
    throw new Error(`main moved while merging ${tag}. Run again to build main's new tip.`)
  return merged
}

function settleVersion() {
  if (git("status", "--porcelain")) throw new Error("Commit or stash your changes first.")
  // why: origin owns release tags; a stale local tag would otherwise make every fetch fail.
  git("fetch", "--quiet", "--force", "--tags", "origin", "main")

  let head = git("rev-parse", "HEAD")
  const current = readVersion()
  const plan = planVersion({ version: current, taggedCommit: tagCommit(`v${current}`), head })
  const tag = `v${plan.version}`

  if (plan.action === "reuse") {
    if (!isAncestor(head, MAIN))
      throw new Error(
        `${tag} marks a commit that is not on ${MAIN}. Check out ${MAIN} and run again.`,
      )
    git("push", "--quiet", "origin", `refs/tags/${tag}`)
    console.log(`Reusing ${tag}, which this commit already built.`)
    return plan.version
  }

  if (head !== git("rev-parse", MAIN))
    throw new Error(`Release from ${MAIN}'s tip. Check it out (or pull) and run again.`)

  if (plan.action === "bump") {
    if (tagCommit(tag)) throw new Error(`${tag} already exists. Set package.json past it on main.`)
    head = mergeBump(tag, head)
  }
  git("tag", "-a", tag, "-m", tag, head)

  try {
    git("push", "--quiet", "origin", `refs/tags/${tag}`)
  } catch (error) {
    // why: a local tag left behind would make the rerun reuse a version origin never saw.
    git("tag", "-d", tag)
    throw new Error(`Could not push ${tag}; git says why above.`, { cause: error })
  }
  console.log(plan.action === "bump" ? `Bumped to ${tag}.` : `Tagged ${tag}.`)
  return plan.version
}

// why: production builds come from their version's tag and local ones never reach EAS, so the tag's fingerprint is the store build's runtime.
function tagRuntimes(version, platforms) {
  const tag = `v${version}`
  try {
    git("fetch", "--quiet", "origin", "tag", tag)
  } catch (error) {
    throw new Error(`No ${tag} tag on origin; production builds tag the commit they build.`, {
      cause: error,
    })
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scryve-${tag}-`))
  try {
    execFileSync("git", ["worktree", "add", "--quiet", "--detach", dir, tag], {
      cwd: root,
      env: { ...process.env, SCRYVE_SKIP_INSTALL: "1" },
      stdio: ["ignore", "ignore", "inherit"],
    })
    execFileSync("pnpm", ["install", "--frozen-lockfile", "--silent"], {
      cwd: dir,
      stdio: ["ignore", "ignore", "inherit"],
    })
    const env = productionEnv(dir)
    return platforms.map((platform) => {
      const fingerprint = execFileSync(
        "npx",
        ["expo-updates", "fingerprint:generate", "--platform", platform],
        { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      )
      return { platform, runtimeVersion: JSON.parse(fingerprint).hash }
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    git("worktree", "prune")
  }
}

// why: the app config reads these, from the shell or a linked .env.local, so APP_VARIANT=preview would fingerprint the preview app.
function productionEnv(dir) {
  const eas = JSON.parse(fs.readFileSync(path.join(dir, "eas.json"), "utf8"))
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(APP_VARIANT|EXPO_|EAS_|SCRYVE_|RELEASE_NOTES$|GITHUB_SHA$)/.test(name),
    ),
  )
  return { ...env, ...eas.build.production.env, EXPO_NO_DOTENV: "1" }
}

function recordLive(args) {
  const version = args.find((arg) => /^\d/.test(arg)) ?? readVersion()
  const platforms = args.filter((arg) => arg === "android" || arg === "ios")
  // why: recording mid-rollout sends players to a store page with no update for them, so it previews by default.
  const write = args.includes("--yes")
  let previewed = false
  const runtimes = tagRuntimes(version, platforms.length ? platforms : ["android", "ios"])
  const commitAt = Number(git("log", "-1", "--format=%ct", `v${version}^{commit}`)) * 1000
  for (const { platform, runtimeVersion } of runtimes) {
    const record = JSON.stringify({ platform, version, runtimeVersion, commitAt })
    if (!write) {
      console.log(`${platform}: would record ${record}`)
      previewed = true
      continue
    }
    execFileSync("npx", ["convex", "run", "--prod", "storeReleases:setLive", record], {
      cwd: root,
      stdio: "inherit",
    })
    console.log(`${platform}: recorded ${record}`)
  }
  if (previewed)
    console.log("Once the rollout reaches everyone, run again with --yes to record it.")
}

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === "version") return void settleVersion()
  if (command === "live") return recordLive(args)
  if (command === "cloud") {
    const version = settleVersion()
    console.log(`Building ${version} for iOS and Android on EAS.`)
    execFileSync(
      "npx",
      ["--yes", easCli, "build", "--profile", "production", "--platform", "all", "--auto-submit"],
      { cwd: root, stdio: "inherit" },
    )
    return
  }
  throw new Error(
    "Usage: release-native.cjs version | cloud | live [version] [android|ios] [--yes]",
  )
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

function settleOffMainVersion() {
  if (git("status", "--porcelain")) throw new Error("Commit or stash your changes first.")
  git("fetch", "--quiet", "--force", "--tags", "origin", "main")
  const head = git("rev-parse", "HEAD")
  if (head === git("rev-parse", MAIN))
    throw new Error(`This is ${MAIN}'s tip; release it without --off-main.`)
  if (!git("branch", "--remotes", "--contains", head))
    throw new Error("Push this commit first, so the build traces back to it.")
  const current = readVersion()
  const version = planOffMainVersion({
    version: current,
    tagged: tagCommit(`v${current}`) !== null,
  })
  console.log(`Building ${head.slice(0, 8)} off main as ${version}, without a tag.`)
  return version
}

module.exports = { bumpPatch, planOffMainVersion, planVersion, settleOffMainVersion, settleVersion }
