#!/usr/bin/env node
/*
 * The release train. Every merge to main deploys Convex and publishes the app to the
 * `beta` channel (.github/workflows/beta.yml). Promotion moves the newest beta update
 * that has soaked without new Sentry issues to production, and fast-forwards the
 * `production` branch, which Cloudflare Pages builds as the production web app.
 *
 *   node scripts/release-train.cjs notes                  player notes for main since the last promotion
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
const PRODUCTION_REF = "origin/production"
const SENTRY_ISSUES_URL = "https://sentry.io/api/0/projects/matthew-chisolm/scryve/issues/"
const PLAYER_FACING_TYPES = new Set(["feat", "fix", "perf"])
const INTERNAL_SCOPES = new Set(["ci", "deps", "docs", "repo", "scripts", "test", "tooling"])
const MAX_NOTES = 8

const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim()
const git = (...args) => run("git", args)
// why: --json keeps stdout parseable and implies --non-interactive where a command supports it.
const eas = (...args) => JSON.parse(run("npx", ["--yes", "eas-cli@latest", ...args, "--json"]))

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
// player-facing notes, skipping internal work. Newest first, as `git log` lists them.
function releaseNotes(subjects) {
  const notes = []
  for (const subject of subjects) {
    const match = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+?)(?:\s+\(#\d+\))?$/.exec(subject)
    if (!match) continue
    const [, type, scope, summary] = match
    if (!PLAYER_FACING_TYPES.has(type) || INTERNAL_SCOPES.has(scope)) continue
    const note = summary[0].toUpperCase() + summary.slice(1)
    if (!notes.includes(note)) notes.push(note)
  }
  return notes.slice(0, MAX_NOTES)
}

function subjectsSinceProduction(head) {
  const range = refExists(PRODUCTION_REF) ? `${PRODUCTION_REF}..${head}` : `${head}~1..${head}`
  return git("log", "--no-merges", "--format=%s", range).split("\n").filter(Boolean)
}

// `eas update:view` returns one update per platform; a group ships them together.
function summarizeGroup(updates) {
  const [first] = updates
  return {
    group: first.group,
    commit: first.gitCommitHash,
    message: first.message,
    publishedAt: Date.parse(first.createdAt),
    updateIds: updates.map((update) => update.id),
  }
}

function findCandidate(now, soakMs) {
  const groupIds = [
    ...new Set(
      eas("update:list", "--branch", "beta", "--limit", "10").currentPage.map((u) => u.group),
    ),
  ]
  const soaking = []
  for (const groupId of groupIds) {
    const group = summarizeGroup(eas("update:view", groupId))
    if (now - group.publishedAt >= soakMs) return { candidate: group, soaking }
    soaking.push(group)
  }
  return { candidate: null, soaking }
}

// why: CI passes SENTRY_READ_TOKEN; on our machines the telemetry skill already stores a read token.
function sentryToken() {
  if (process.env.SENTRY_READ_TOKEN) return process.env.SENTRY_READ_TOKEN
  const telemetryEnv = path.join(os.homedir(), ".config", "telemetry", "env")
  const contents = fs.existsSync(telemetryEnv) ? fs.readFileSync(telemetryEnv, "utf8") : ""
  const token = contents.match(/^TELEMETRY_SENTRY_TOKEN=(.*)$/m)?.[1]
  if (!token) throw new Error("Set SENTRY_READ_TOKEN (event:read) to check beta for new issues")
  return token
}

// Issues first seen since the candidate was published, on any of its platform updates.
async function newIssues(candidate) {
  const query = [
    "is:unresolved",
    `updateId:[${candidate.updateIds.join(",")}]`,
    `firstSeen:>=${new Date(candidate.publishedAt).toISOString()}`,
  ].join(" ")
  const url = `${SENTRY_ISSUES_URL}?${new URLSearchParams({ query, statsPeriod: "14d" })}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${sentryToken()}` } })
  if (!response.ok) throw new Error(`Sentry returned ${response.status} for the beta issue check`)
  return response.json()
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

  const { candidate, soaking } = findCandidate(Date.now(), soakMinutes * 60_000)
  for (const group of soaking)
    console.log(`Still soaking: ${group.commit.slice(0, 7)} ${group.message}`)
  if (!candidate) return console.log(`Nothing on beta has soaked for ${soakMinutes} minutes yet.`)

  const commit = candidate.commit.slice(0, 7)
  if (candidate.commit === git("rev-parse", PRODUCTION_REF))
    return console.log(`Production already runs ${commit}.`)
  if (!isAncestor(candidate.commit, "origin/main"))
    throw new Error(`${commit} is not on main; only merged commits are promoted.`)
  if (!isAncestor(PRODUCTION_REF, candidate.commit))
    throw new Error(
      `${commit} is not ahead of production, so promoting it would roll production back.`,
    )

  const minutes = Math.round((Date.now() - candidate.publishedAt) / 60_000)
  console.log(`Candidate: ${commit}, beta group ${candidate.group}, on beta for ${minutes} minutes`)
  for (const subject of git(
    "log",
    "--no-merges",
    "--format=%s",
    `${PRODUCTION_REF}..${candidate.commit}`,
  ).split("\n"))
    console.log(`  ${subject}`)

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

  eas(
    "update:republish",
    "--group",
    candidate.group,
    "--destination-channel",
    "production",
    "--message",
    `Promote ${commit} from beta`,
  )
  git("push", "origin", `${candidate.commit}:refs/heads/production`)
  console.log(
    `Promoted ${commit}: the app update is live and Pages is building the production web app.`,
  )
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
  if (command === "notes")
    return console.log(releaseNotes(subjectsSinceProduction("HEAD")).join("\n"))
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

module.exports = { releaseNotes, summarizeGroup }
