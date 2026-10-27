#!/usr/bin/env node
/*
 * The release train. Every merge to main deploys Convex and publishes the app to the
 * `beta` channel (.github/workflows/beta.yml). Promotion moves the newest beta update
 * that has soaked without new Sentry issues to production, and fast-forwards the
 * `production` branch, which Cloudflare Pages builds as the production web app.
 *
 *   node scripts/release-train.cjs notes                  player notes for main's newest changes, as JSON
 *   node scripts/release-train.cjs promote                report the candidate and whether it is clean
 *   node scripts/release-train.cjs promote --yes          promote it
 *   node scripts/release-train.cjs promote --soak-minutes 30
 */
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { parseArgs } = require("node:util")

const root = path.join(path.dirname(require.resolve("./release-train.cjs")), "..")
const easCli = `eas-cli@${require(path.join(root, "package.json")).config.easCli}`
const PRODUCTION_REF = "origin/production"
const SENTRY_ISSUES_URL = "https://sentry.io/api/0/projects/matthew-chisolm/scryve/issues/"
const PLAYER_FACING_TYPES = new Set(["feat", "fix", "perf"])
const INTERNAL_SCOPES = new Set(["ci", "deps", "docs", "repo", "scripts", "test", "tooling"])
const MAX_NOTES = 8
const PLATFORMS = ["android", "ios"]

const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
const git = (...args) => run("git", args)
// why: --json keeps stdout parseable and implies --non-interactive where a command supports it.
const eas = (...args) => JSON.parse(run("npx", ["--yes", easCli, ...args, "--json"]))

function refExists(ref) {
  try {
    git("rev-parse", "--verify", "--quiet", ref)
    return true
  } catch {
    return false
  }
}

function isAncestor(ancestor, commit) {
  try {
    git("merge-base", "--is-ancestor", ancestor, commit)
    return true
  } catch {
    return false
  }
}

// Turns squash-merge subjects like "fix(decks): pasted cards match again (#303)" into
// player-facing notes, or null for internal work.
function playerNote(subject) {
  const match = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+?)(?:\s+\(#\d+\))?$/.exec(subject)
  if (!match) return null
  const [, type, scope, summary] = match
  if (!PLAYER_FACING_TYPES.has(type) || INTERNAL_SCOPES.has(scope)) return null
  return summary[0].toUpperCase() + summary.slice(1)
}

function releaseNotes(commits) {
  const notes = []
  const newSince = {}
  for (const { commit, subject } of commits) {
    if (notes.length === MAX_NOTES) break
    newSince[commit] = notes.length
    const note = playerNote(subject)
    if (note && !notes.includes(note)) notes.push(note)
  }
  return { notes, newSince }
}

function recentCommits(head) {
  return git("log", "--first-parent", "--max-count=200", "--format=%H%x1f%s%x1f%b%x1e", head)
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [commit, subject, body] = record.split("\x1f")
      const title = subject.startsWith("Merge pull request") ? body.split("\n")[0] : subject
      return { commit, subject: title }
    })
}

// `eas update:view` returns the updates in one group.
function summarizeGroup(updates) {
  const [first] = updates
  return {
    commit: first.gitCommitHash,
    message: first.message,
    firstPublishedAt: Date.parse(first.createdAt),
    lastPublishedAt: Date.parse(first.createdAt),
    groups: [first.group],
    platforms: updates.map((update) => update.platform),
    updateIds: updates.map((update) => update.id),
    runtimes: Object.fromEntries(updates.map((update) => [update.platform, update.runtimeVersion])),
  }
}

// Each platform has its own runtime version, so one merge publishes a group per platform.
// Groups arrive newest first; a release is promotable once every platform is in and it has soaked.
function pickRelease(groups, now, soakMs) {
  const releases = new Map()
  for (const group of groups) {
    const release = releases.get(group.commit)
    // why: re-running beta publishes a commit again, and beta devices run the newest group per platform.
    if (release?.platforms.some((platform) => group.platforms.includes(platform))) continue
    const merged = release
      ? {
          ...release,
          firstPublishedAt: Math.min(release.firstPublishedAt, group.firstPublishedAt),
          lastPublishedAt: Math.max(release.lastPublishedAt, group.lastPublishedAt),
          groups: [...release.groups, ...group.groups],
          platforms: [...release.platforms, ...group.platforms],
          updateIds: [...release.updateIds, ...group.updateIds],
          runtimes: { ...release.runtimes, ...group.runtimes },
        }
      : group
    releases.set(group.commit, merged)
    const complete = PLATFORMS.every((platform) => merged.platforms.includes(platform))
    if (complete && now - merged.lastPublishedAt >= soakMs) {
      releases.delete(group.commit)
      return { candidate: merged, soaking: [...releases.values()] }
    }
  }
  const soaking = [...releases.values()].filter((release) => now - release.lastPublishedAt < soakMs)
  return { candidate: null, soaking }
}

function* betaGroups() {
  const groupIds = new Set(
    eas("update:list", "--branch", "beta", "--limit", "50").currentPage.map((u) => u.group),
  )
  for (const groupId of groupIds) yield summarizeGroup(eas("update:view", groupId))
}

function sentryToken() {
  if (process.env.SENTRY_READ_TOKEN) return process.env.SENTRY_READ_TOKEN
  const telemetryEnv = path.join(os.homedir(), ".config", "telemetry", "env")
  const contents = fs.existsSync(telemetryEnv) ? fs.readFileSync(telemetryEnv, "utf8") : ""
  const token = contents.match(/^TELEMETRY_SENTRY_TOKEN=(.*)$/m)?.[1]
  if (!token) {
    throw new Error(
      `No Sentry read token (event:read) to check beta for new issues. Set SENTRY_READ_TOKEN, or TELEMETRY_SENTRY_TOKEN in ${telemetryEnv} (the telemetry skill's setup.sh writes it)`,
    )
  }
  return token
}

// Issues first seen since the candidate's first platform published, on any of its updates.
async function newIssues(candidate) {
  const query = [
    "is:unresolved",
    `updateId:[${candidate.updateIds.join(",")}]`,
    `firstSeen:>=${new Date(candidate.firstPublishedAt).toISOString()}`,
  ].join(" ")
  const url = `${SENTRY_ISSUES_URL}?${new URLSearchParams({ query, statsPeriod: "14d" })}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${sentryToken()}` } })
  if (!response.ok) throw new Error(`Sentry returned ${response.status} for the beta issue check`)
  return response.json()
}

const prNumber = (subject) =>
  /\(#(\d+)\)$/.exec(subject)?.[1] ?? /^Merge pull request #(\d+) from /.exec(subject)?.[1]

const subjectOf = (message) => message.split("\n")[0]

/** PRs a revert names: a merged `revert-<n>-` branch, `Revert "… (#n)"`, or a `Reverts #n` line. */
function revertedPrs(message) {
  const subject = subjectOf(message)
  return [
    /\/revert-(\d+)-/.exec(subject)?.[1],
    prNumber(/^Revert "(.*)"/.exec(subject)?.[1] ?? ""),
    ...[...message.matchAll(/^Reverts (?:HashingSeeds\/scryve)?#(\d+)/gim)].map(
      (match) => match[1],
    ),
  ].filter(Boolean)
}

/** PRs a range of commit messages ships, minus the ones a revert in the range names. */
function prNumbers(messages) {
  const reverted = new Set(messages.flatMap(revertedPrs))
  const shipped = messages.map((message) => prNumber(subjectOf(message)))
  return [...new Set(shipped.filter((pr) => pr && !reverted.has(pr)))].map(Number)
}

function closedIssues(prs) {
  if (prs.length === 0) return []
  const fields = prs.map(
    (pr) =>
      `pr${pr}: pullRequest(number: ${pr}) { closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } } }`,
  )
  const query = `{ repository(owner: "HashingSeeds", name: "scryve") { ${fields.join(" ")} } }`
  const { data } = JSON.parse(run("gh", ["api", "graphql", "-f", `query=${query}`]))
  const issues = Object.values(data.repository).flatMap(
    (pr) =>
      pr?.closingIssuesReferences.nodes
        .filter((issue) => issue.repository.nameWithOwner === "HashingSeeds/scryve")
        .map((issue) => issue.number) ?? [],
  )
  return [...new Set(issues)]
}

function shipFixes(candidate, messages) {
  const prs = prNumbers(messages)
  let args
  try {
    const issues = closedIssues(prs)
    if (issues.length === 0) return
    args = { commit: candidate.commit, issues, runtimes: candidate.runtimes }
    run("pnpm", ["exec", "convex", "run", "feedback:shipFixes", JSON.stringify(args)])
    console.log(`Marked feedback fixed for ${issues.map((issue) => `#${issue}`).join(", ")}`)
  } catch (error) {
    const retry = args
      ? `Rerun: pnpm exec convex run feedback:shipFixes '${JSON.stringify(args)}'`
      : `Shipped PRs: ${prs.map((pr) => `#${pr}`).join(", ")}`
    console.warn(`Promoted, but feedback was not marked fixed: ${error.message}. ${retry}`)
  }
}

async function promote({ yes, soakMinutes }) {
  git("fetch", "--quiet", "origin", "main")
  if (!refExists("origin/main")) throw new Error("Could not fetch main")
  try {
    git("fetch", "--quiet", "origin", "production:refs/remotes/origin/production")
  } catch {
    throw new Error(
      "There is no production branch yet. Point it at what production runs today: git push origin <commit>:refs/heads/production",
    )
  }

  const { candidate, soaking } = pickRelease(betaGroups(), Date.now(), soakMinutes * 60_000)
  for (const release of soaking)
    console.log(`Still soaking: ${release.commit.slice(0, 7)} ${release.message}`)
  if (!candidate) return console.log(`Nothing on beta has soaked for ${soakMinutes} minutes yet.`)

  const commit = candidate.commit.slice(0, 7)
  if (!isAncestor(candidate.commit, "origin/main"))
    throw new Error(`${commit} is not on main; only merged commits are promoted.`)
  // why: a hotfix promoted with --soak-minutes 0 can put production ahead of the soaked candidate.
  if (isAncestor(candidate.commit, PRODUCTION_REF))
    return console.log(`Production already includes ${commit}.`)
  if (!isAncestor(PRODUCTION_REF, candidate.commit))
    throw new Error(
      `${commit} is not ahead of production, so promoting it would roll production back.`,
    )

  const minutes = Math.round((Date.now() - candidate.lastPublishedAt) / 60_000)
  console.log(
    `Candidate: ${commit}, beta groups ${candidate.groups.join(", ")}, on beta for ${minutes} minutes`,
  )
  // why: read before the production push below, which moves PRODUCTION_REF to the candidate.
  const messages = git(
    "log",
    "--first-parent",
    "--format=%B%x00",
    `${PRODUCTION_REF}..${candidate.commit}`,
  )
    .split("\0")
    .map((message) => message.trim())
    .filter(Boolean)
  const subjects = messages.map((message) => message.split("\n")[0])
  for (const subject of subjects) console.log(`  ${subject}`)

  const issues = await newIssues(candidate)
  if (issues.length > 0) {
    for (const issue of issues)
      console.log(
        `New on beta: ${issue.shortId} ${issue.title} (${issue.count}) ${issue.permalink}`,
      )
    process.exitCode = 1
    return console.log(
      "Not promoting. Fix forward or revert on main; the fix reaches beta on merge.",
    )
  }
  if (!yes) return console.log("No new Sentry issues. Run with --yes to promote.")

  for (const group of candidate.groups)
    eas(
      "update:republish",
      "--group",
      group,
      "--destination-channel",
      "production",
      "--message",
      `Promote ${commit} from beta`,
    )
  git("push", "origin", `${candidate.commit}:refs/heads/production`)
  console.log(
    `Promoted ${commit}: the app update is live and Pages is building the production web app.`,
  )
  shipFixes(candidate, messages)
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "yes": { type: "boolean", default: false },
      "soak-minutes": { type: "string", default: "60" },
    },
  })
  const [command] = positionals
  if (command === "notes") return console.log(JSON.stringify(releaseNotes(recentCommits("HEAD"))))
  const soakMinutes = Number(values["soak-minutes"])
  if (command === "promote" && Number.isFinite(soakMinutes))
    return promote({ yes: values.yes, soakMinutes })
  throw new Error("Usage: release-train.cjs notes | promote [--yes] [--soak-minutes 60]")
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { pickRelease, prNumbers, releaseNotes, summarizeGroup }
