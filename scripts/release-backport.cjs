const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { parseArgs } = require("node:util")

const { BACKPORT_PREFIX, newIssues, releaseNotes, summarizeGroup } = require("./release-train.cjs")

const root = path.join(path.dirname(require.resolve("./release-backport.cjs")), "..")
const easCli = `eas-cli@${require(path.join(root, "package.json")).config.easCli}`
const REHEARSAL_BRANCH = "backport-rehearsal"
const PROMOTED = /Promote backport ([0-9a-f-]{36})/g

function sh(command, args, { cwd = root, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
    const tail = output.split("\n").slice(-25).join("\n")
    throw new Error(`${command} ${args.join(" ")} failed\n${tail}`)
  }
  return result.stdout.trim()
}

const git = (cwd, ...args) => sh("git", args, { cwd })

// why: eas-cli can print log lines on stdout before the JSON (expo/eas-cli#3870, #3659).
function parseJson(text) {
  const start = text.split("\n").findIndex((line) => /^[{[]/.test(line))
  if (start === -1) throw new Error(`Expected JSON, got:\n${text.slice(-2000)}`)
  return JSON.parse(text.split("\n").slice(start).join("\n"))
}

// why: --json implies --non-interactive, and update:view rejects the explicit flag.
const eas = (args, options) => parseJson(sh("npx", ["--yes", easCli, ...args, "--json"], options))

function isAncestor(ancestor, commit) {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", ancestor, commit], { cwd: root }).status === 0
  )
}

// why: a promoted backport's commit holds the fix as a cherry-pick, which has a different sha.
const hasPick = (base, fix) =>
  git(
    root,
    "log",
    "-1",
    "--format=%H",
    "--fixed-strings",
    `--grep=(cherry picked from commit ${fix})`,
    base,
  ) !== ""

const hasCommit = (commit) =>
  spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root }).status === 0

// why: Expo's API fails some reads. Only reads retry; a publish may have landed.
function retry(read, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return read()
    } catch (error) {
      if (attempt === attempts) throw error
    }
  }
}

function pages(args, { size = 50, max = Infinity } = {}) {
  const rows = []
  for (let offset = 0; offset < max * size; offset += size) {
    const page = retry(() => eas([...args, "--limit", String(size), "--offset", String(offset)]))
    const items = Array.isArray(page) ? page : page.currentPage
    rows.push(...items)
    if (items.length < size) break
  }
  return rows
}

// why: eas-cli returns update groups and builds newest first; planTargets, discover and unpromoted take the first match as the newest.
const updateGroups = (args, options) =>
  pages(["update:list", ...args], options).map((row) => ({
    group: row.group,
    runtime: row.runtimeVersion,
    platforms: row.platforms.split(/,\s*/),
    message: row.message,
    isRollBackToEmbedded: row.isRollBackToEmbedded,
  }))

const isBackport = (group) => group.message.includes(`"${BACKPORT_PREFIX}`)
// why: beta holds every merge's groups, and Expo fails reads deep into that list.
const recentBeta = (args = []) => updateGroups(["--branch", "beta", ...args], { max: 1 })

const productionBuilds = () =>
  pages(["build:list", "--build-profile", "production", "--status", "finished"])
    .filter((build) => build.fingerprint?.hash)
    .map((build) => ({
      platform: build.platform.toLowerCase(),
      runtime: build.fingerprint.hash,
      commit: build.gitCommitHash,
      label: `${build.appVersion} (${build.appBuildVersion})`,
      version: build.appVersion,
    }))

// why: older rebuilds of an app version were tester builds that the store copy replaced.
function planTargets({ groups, builds, current }) {
  const targets = new Map()
  for (const group of groups) {
    for (const platform of group.platforms) {
      const key = `${platform}:${group.runtime}`
      if (targets.has(key)) continue
      targets.set(key, {
        platform,
        runtime: group.runtime,
        group: group.isRollBackToEmbedded ? null : group.group,
        buildCommit: null,
        label: null,
      })
    }
  }
  const versions = new Set()
  for (const build of builds) {
    const key = `${build.platform}:${build.runtime}`
    const versionKey = `${build.platform}:${build.version}`
    const target = targets.get(key)
    const newest = !versions.has(versionKey)
    versions.add(versionKey)
    if (!target && !newest) continue
    targets.set(key, {
      platform: build.platform,
      runtime: build.runtime,
      group: target?.group ?? null,
      buildCommit: target?.buildCommit ?? build.commit,
      label: target?.label ?? build.label,
    })
  }
  return [...targets.values()].filter((target) => current[target.platform] !== target.runtime)
}

function parseManifest(tag, body) {
  const commit = /^git-sha:\s*([0-9a-f]{7,40})\b/m.exec(body)?.[1]
  const runtimes = /^runtime-version:(.*)$/m.exec(body)?.[1] ?? ""
  if (!commit) return []
  return [...runtimes.matchAll(/\b(ios|android)\s+([0-9a-f]{40})\b/g)].map(
    ([, platform, runtime]) => ({ platform, runtime, commit, label: tag }),
  )
}

const storeManifests = () =>
  JSON.parse(
    sh("gh", ["release", "list", "--limit", "100", "--json", "tagName,isDraft,isPrerelease"]),
  )
    .filter((release) => !release.isDraft && !release.isPrerelease)
    .flatMap(({ tagName }) =>
      parseManifest(
        tagName,
        sh("gh", ["release", "view", tagName, "--json", "body", "-q", ".body"]),
      ),
    )

function manifestTargets({ manifests, groups, current }) {
  const targets = new Map()
  for (const { platform, runtime, commit, label } of manifests) {
    const key = `${platform}:${runtime}`
    if (targets.has(key) || current[platform] === runtime) continue
    const group = groups.find((g) => g.runtime === runtime && g.platforms.includes(platform))
    targets.set(key, {
      platform,
      runtime,
      group: group && !group.isRollBackToEmbedded ? group.group : null,
      buildCommit: commit,
      label,
    })
  }
  return [...targets.values()]
}

function parseTarget(value) {
  const match = /^(ios|android):([0-9a-f]+)(?:@([0-9a-f]{7,40}))?$/.exec(value)
  if (!match) throw new Error(`--target ${value}: expected ios|android:<runtime>[@<commit>]`)
  const [, platform, runtime, commit] = match
  if (commit && runtime.length !== 40)
    throw new Error(`--target ${value}: give the full runtime when you name its commit`)
  return { platform, runtime, commit }
}

function chooseTargets(planned, requested) {
  if (requested.length === 0) return planned
  return requested.map(({ platform, runtime, commit }) => {
    if (commit) return { platform, runtime, group: null, buildCommit: commit, label: "manual" }
    const matches = planned.filter((t) => t.platform === platform && t.runtime.startsWith(runtime))
    if (matches.length !== 1)
      throw new Error(`--target ${platform}:${runtime} matches ${matches.length} planned runtimes`)
    return matches[0]
  })
}

// why: promote ships only a runtime's newest backport, so a new one must build on any still on beta or the older fix never reaches production.
const onPendingBackports = (targets, backports) =>
  targets.map((target) => {
    const pending = backports.find(
      (g) => g.runtime === target.runtime && g.platforms.includes(target.platform),
    )
    return pending ? { ...target, group: pending.group, pending: true } : target
  })

function discover(requested, all) {
  const groups = updateGroups(["--branch", "production"])
  const current = {}
  for (const group of recentBeta().filter((group) => !isBackport(group)))
    for (const platform of group.platforms) current[platform] ??= group.runtime
  const store = manifestTargets({ manifests: storeManifests(), groups, current })
  const everything =
    all || requested.length > 0 ? planTargets({ groups, builds: productionBuilds(), current }) : []
  const known = new Set(everything.map((t) => `${t.platform}:${t.runtime}`))
  const targets =
    requested.length > 0
      ? chooseTargets(
          [...everything, ...store.filter((t) => !known.has(`${t.platform}:${t.runtime}`))],
          requested,
        )
      : all
        ? everything
        : store
  const runtimes = [...new Set(targets.map((target) => target.runtime))]
  const backports = runtimes.flatMap((runtime) =>
    recentBeta(["--runtime-version", runtime]).filter(isBackport),
  )
  return onPendingBackports(targets, backports)
}

function resolveBase(target) {
  const commit = target.group
    ? retry(() => eas(["update:view", target.group])).find((u) => u.platform === target.platform)
        ?.gitCommitHash
    : target.buildCommit
  if (!commit) throw new Error("its update records no commit")
  if (!hasCommit(commit))
    git(root, "fetch", "--quiet", "origin", "refs/tags/backport/*:refs/tags/backport/*")
  if (!hasCommit(commit)) throw new Error(`commit ${commit.slice(0, 8)} is not in this repo`)
  return git(root, "rev-parse", commit)
}

function profileEnv(dir) {
  const { build } = JSON.parse(fs.readFileSync(path.join(dir, "eas.json"), "utf8"))
  const resolve = (name) => {
    const profile = build[name]
    return { ...(profile.extends ? resolve(profile.extends) : {}), ...profile.env }
  }
  return resolve("production")
}

function fingerprint(dir, platform, extraEnv = {}) {
  const env = { ...process.env, ...profileEnv(dir), EXPO_NO_DOTENV: "1", ...extraEnv }
  const bin = path.join(dir, "node_modules", ".bin", "expo-updates")
  return parseJson(sh(bin, ["fingerprint:generate", "--platform", platform], { cwd: dir, env }))
    .hash
}

function cherryPick(dir, commit) {
  const parents = git(root, "rev-list", "--parents", "-n", "1", commit).split(" ").length - 1
  const args = ["-c", "commit.gpgsign=false", "cherry-pick", "-x"]
  const result = spawnSync("git", [...args, ...(parents > 1 ? ["-m", "1"] : []), commit], {
    cwd: dir,
    encoding: "utf8",
  })
  if (result.status === 0) return
  spawnSync("git", ["cherry-pick", "--abort"], { cwd: dir })
  const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`
    .trim()
    .split("\n")
    .slice(-10)
    .join("\n")
  throw new Error(`${commit.slice(0, 8)} did not cherry-pick; backport it by hand\n${detail}`)
}

function checkBundle(dir, changed) {
  const { scripts = {}, devDependencies = {} } = JSON.parse(
    fs.readFileSync(path.join(dir, "package.json"), "utf8"),
  )
  if (scripts.compile) {
    console.log("  typechecking")
    sh("pnpm", ["run", "compile"], { cwd: dir })
  }
  const sources = changed.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
  if (devDependencies.jest && sources.length > 0) {
    console.log("  running related tests")
    sh("pnpm", ["exec", "jest", "--findRelatedTests", "--passWithNoTests", ...sources], {
      cwd: dir,
    })
  }
}

function backportBase({ base, targets, fixes, branch, keep }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scryve-backport-${base.slice(0, 8)}-`))
  try {
    // why: the post-checkout hook links the development .env.local, which a production bundle must never read.
    git(root, "-c", "core.hooksPath=/dev/null", "worktree", "add", "--detach", dir, base)
    console.log("  installing dependencies")
    sh("pnpm", ["install", "--frozen-lockfile"], { cwd: dir })

    for (const target of targets) {
      const hash = fingerprint(dir, target.platform)
      if (hash !== target.runtime)
        throw new Error(
          `${target.platform} at ${base.slice(0, 8)} fingerprints to ${hash.slice(0, 8)}, not ${target.runtime.slice(0, 8)}, so this checkout cannot reproduce that runtime`,
        )
    }

    for (const fix of fixes) cherryPick(dir, fix)
    // why: a fix that changes dependencies or patches must be fingerprinted and bundled with them installed.
    sh("pnpm", ["install", "--frozen-lockfile"], { cwd: dir })
    const head = git(dir, "rev-parse", "HEAD")
    const changed = git(dir, "diff", "--name-only", base, head).split("\n").filter(Boolean)
    const history = git(dir, "log", "--first-parent", "--max-count=200", "--format=%H%x1f%s")
      .split("\n")
      .map((line) => line.split("\x1f"))
      .map(([commit, subject]) => ({ commit, subject }))
    const bundleEnv = {
      APP_VARIANT: "production",
      EXPO_NO_DOTENV: "1",
      RELEASE_NOTES: JSON.stringify(releaseNotes(history)),
      GITHUB_SHA: head,
    }

    for (const target of targets) {
      const hash = fingerprint(dir, target.platform, bundleEnv)
      if (hash !== target.runtime)
        throw new Error(
          `the backport changes the ${target.platform} runtime to ${hash.slice(0, 8)}, so it is not JS-only for this binary. Changed: ${changed.join(", ")}`,
        )
    }

    checkBundle(dir, changed)
    const platforms = targets.map((target) => target.platform)
    console.log(`  exporting ${platforms.join(" and ")}`)
    const env = { ...process.env, ...bundleEnv }
    const exportCommand = [
      "pnpm exec expo export --output-dir dist --dump-sourcemap --dump-assetmap",
      ...platforms.map((platform) => `--platform ${platform}`),
    ].join(" ")
    sh("npx", ["--yes", easCli, "env:exec", "production", "--non-interactive", exportCommand], {
      cwd: dir,
      env,
    })
    if (!branch) return { head }

    if (branch === "beta")
      git(dir, "push", "--quiet", "origin", `${head}:refs/tags/backport/${head}`)
    const subject = git(root, "log", "-1", "--format=%s", fixes.at(-1))
    const message = `${BACKPORT_PREFIX}${fixes.map((fix) => fix.slice(0, 7)).join(" ")} onto ${base.slice(0, 7)}: ${subject}`
    console.log(`  publishing to ${branch}`)
    const published = eas(
      [
        "update",
        "--skip-bundler",
        "--branch",
        branch,
        "--environment",
        "production",
        "--platform",
        platforms.length === 1 ? platforms[0] : "all",
        "--message",
        message,
      ],
      { cwd: dir, env },
    )
    for (const update of published) {
      const target = targets.find((t) => t.platform === update.platform)
      if (target?.runtime !== update.runtimeVersion)
        throw new Error(
          `EAS published ${update.platform} under runtime ${update.runtimeVersion}, not ${target?.runtime}. Delete it: eas update:delete ${update.group}`,
        )
    }
    uploadSourceMaps(dir, env)
    // why: platforms on different runtimes publish as separate groups.
    const groups = Object.fromEntries(published.map((update) => [update.platform, update.group]))
    return { head, groups }
  } finally {
    if (keep) console.log(`  kept ${dir}`)
    else spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: root })
  }
}

function uploadSourceMaps(dir, env) {
  if (!process.env.SENTRY_AUTH_TOKEN)
    return console.warn("  SENTRY_AUTH_TOKEN is not set; crashes from this update stay minified")
  sh("pnpm", ["exec", "sentry-expo-upload-sourcemaps", "dist"], {
    cwd: dir,
    env: {
      ...env,
      SENTRY_ORG: "matthew-chisolm",
      SENTRY_PROJECT: "scryve",
      SENTRY_URL: "https://sentry.io/",
    },
  })
}

function assertUnread(branch) {
  const reader = pages(["channel:list"], 25).find((channel) =>
    channel.updateBranches.some((b) => b.name === branch),
  )
  if (reader)
    throw new Error(`Channel ${reader.name} reads ${branch}, so a rehearsal would reach devices`)
}

const describe = (target) =>
  `${target.platform} ${target.runtime.slice(0, 8)} ${target.label ?? "(no EAS build)"}`

function backport(fixArgs, { rehearse, yes, keep, all, targets: requested }) {
  if (rehearse && yes) throw new Error("Pick one: --rehearse or --yes")
  git(root, "fetch", "--quiet", "origin", "main")
  const fixes = fixArgs
    .map((fix) => git(root, "rev-parse", `${fix}^{commit}`))
    .sort(
      (a, b) =>
        Number(git(root, "log", "-1", "--format=%ct", a)) -
        Number(git(root, "log", "-1", "--format=%ct", b)),
    )
  for (const fix of fixes)
    if (!isAncestor(fix, "origin/main"))
      throw new Error(`${fix.slice(0, 8)} is not on main; merge the fix first, then backport it.`)

  const branch = rehearse ? REHEARSAL_BRANCH : yes ? "beta" : null
  if (rehearse) assertUnread(REHEARSAL_BRANCH)

  const bases = new Map()
  const results = []
  for (const target of discover(requested, all)) {
    try {
      const base = resolveBase(target)
      const needed = fixes.filter((fix) => !isAncestor(fix, base) && !hasPick(base, fix))
      if (needed.length === 0) {
        results.push({ target, status: "already has the fix" })
        continue
      }
      const key = `${base} ${needed.join(" ")}`
      bases.set(key, { base, needed, targets: [...(bases.get(key)?.targets ?? []), target] })
    } catch (error) {
      results.push({ target, status: `failed: ${error.message}` })
    }
  }

  for (const { base, needed, targets } of bases.values()) {
    console.log(`\n${base.slice(0, 8)} for ${targets.map(describe).join(", ")}`)
    try {
      const { head, groups } = backportBase({ base, targets, fixes: needed, branch, keep })
      for (const target of targets) {
        const group = groups?.[target.platform]
        results.push({
          target,
          status: group ? `published ${group} (${head.slice(0, 8)})` : "ready",
        })
      }
    } catch (error) {
      for (const target of targets) results.push({ target, status: `failed: ${error.message}` })
    }
  }

  console.log("")
  for (const { target, status } of results) console.log(`${describe(target)}: ${status}`)
  if (results.some(({ status }) => status.startsWith("failed"))) process.exitCode = 1
  else if (!branch)
    console.log(
      "\nEvery target builds. Run with --rehearse to publish where no device reads, or --yes for beta.",
    )
  else if (rehearse)
    console.log(
      `\nNothing reads ${REHEARSAL_BRANCH}. Remove it: npx ${easCli} branch:delete ${REHEARSAL_BRANCH}`,
    )
  else console.log("\nOn beta. Check it on a device, then: pnpm release:backport promote --yes")
}

function list(requested, all) {
  for (const target of discover(requested, all)) {
    const base = target.pending
      ? `beta backport ${target.group}`
      : target.group
        ? `production update ${target.group}`
        : `build ${target.buildCommit?.slice(0, 8)}`
    console.log(`${describe(target)} builds on ${base}`)
  }
}

function unpromoted(betaGroups, productionMessages) {
  const promoted = new Set(
    productionMessages.flatMap((m) => [...m.matchAll(PROMOTED)].map((x) => x[1])),
  )
  const seen = new Set()
  return betaGroups.filter((group) => {
    if (!group.message.startsWith(BACKPORT_PREFIX)) return false
    const keys = Object.entries(group.runtimes).map(
      ([platform, runtime]) => `${platform}:${runtime}`,
    )
    const newest = keys.every((key) => !seen.has(key))
    for (const key of keys) seen.add(key)
    return newest && !group.groups.some((id) => promoted.has(id))
  })
}

async function promote({ yes, all, targets: requested }) {
  const pending = discover(requested, all).filter((target) => target.pending)
  const groups = [...new Set(pending.map((target) => target.group))].map((id) =>
    summarizeGroup(retry(() => eas(["update:view", id]))),
  )
  const productionMessages = updateGroups(["--branch", "production"]).map((group) => group.message)
  const candidates = unpromoted(groups, productionMessages)
  if (candidates.length === 0)
    return console.log("No backports on beta are waiting for production.")

  for (const candidate of candidates) {
    const minutes = Math.round((Date.now() - candidate.lastPublishedAt) / 60_000)
    console.log(`${candidate.groups[0]} ${candidate.message} (on beta ${minutes} minutes)`)
    const issues = await newIssues(candidate)
    if (issues.length > 0) {
      for (const issue of issues)
        console.log(`  New on beta: ${issue.shortId} ${issue.title} ${issue.permalink}`)
      process.exitCode = 1
      continue
    }
    if (!yes) continue
    eas([
      "update:republish",
      "--group",
      candidate.groups[0],
      "--destination-channel",
      "production",
      "--message",
      `Promote backport ${candidate.groups[0]}`,
    ])
    console.log("  promoted")
  }
  if (!yes) console.log("\nRun with --yes to promote these.")
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      yes: { type: "boolean", default: false },
      rehearse: { type: "boolean", default: false },
      keep: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      target: { type: "string", multiple: true, default: [] },
    },
  })
  const targets = values.target.map(parseTarget)
  const [command] = positionals
  if (command === "list") return list(targets, values.all)
  if (command === "promote") return promote({ ...values, targets })
  if (positionals.length > 0) return backport(positionals, { ...values, targets })
  throw new Error(
    "Usage: release-backport.cjs list | <sha...> [--rehearse | --yes] | promote [--yes] [--all | --target <platform:runtime>]",
  )
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  onPendingBackports,
  manifestTargets,
  parseManifest,
  parseTarget,
  planTargets,
  unpromoted,
}
