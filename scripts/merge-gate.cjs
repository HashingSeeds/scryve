const { spawnSync } = require("node:child_process")

const MARKER = "<!-- merge-gate -->"
const FINGERPRINT_MARKER = "<!-- native-fingerprint-check -->"
const SELF_WORKFLOW = "merge gate"
const REVIEWERS = {
  CodeRabbit: "coderabbitai",
  Codex: "chatgpt-codex-connector",
  Macroscope: "macroscopeapp",
}

const QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      headRefOid
      body
      reviews(last: 100) { nodes { author { login } state } }
      reviewThreads(first: 100) {
        nodes { isResolved comments(first: 1) { nodes { author { login } } } }
      }
      comments(last: 100) { nodes { author { login } body } }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    status
                    conclusion
                    isRequired(pullRequestNumber: $number)
                    checkSuite { workflowRun { workflow { name } } }
                  }
                  ... on StatusContext {
                    context
                    state
                    isRequired(pullRequestNumber: $number)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`

function checkRunState({ status, conclusion }) {
  if (status !== "COMPLETED") return "pending"
  if (conclusion === "SUCCESS") return "pass"
  if (conclusion === "SKIPPED" || conclusion === "NEUTRAL") return "skip"
  return "fail"
}

function statusContextState({ state }) {
  if (state === "SUCCESS") return "pass"
  if (state === "PENDING" || state === "EXPECTED") return "pending"
  return "fail"
}

function toPullRequest(graphql, files) {
  const pr = graphql.data.repository.pullRequest
  const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []
  return {
    headSha: pr.headRefOid,
    body: pr.body ?? "",
    files,
    reviews: pr.reviews.nodes.map((review) => ({
      author: review.author?.login,
      state: review.state,
    })),
    threads: pr.reviewThreads.nodes.map((thread) => ({
      author: thread.comments.nodes[0]?.author?.login,
      isResolved: thread.isResolved,
    })),
    comments: pr.comments.nodes.map((comment) => ({
      author: comment.author?.login,
      body: comment.body,
    })),
    checks: contexts.map((context) =>
      context.__typename === "CheckRun"
        ? {
            name: context.name,
            workflow: context.checkSuite?.workflowRun?.workflow.name ?? null,
            state: checkRunState(context),
            required: context.isRequired,
          }
        : {
            name: context.context,
            workflow: null,
            state: statusContextState(context),
            required: context.isRequired,
          },
    ),
  }
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`

function checksGate(checks) {
  const others = checks.filter((check) => check.workflow !== SELF_WORKFLOW)
  const required = others.filter((check) => check.required)
  // why: main has no required checks today, so every check counts until a ruleset marks some.
  const counted = required.length > 0 ? required : others
  const named = (state) =>
    counted.filter((check) => check.state === state).map((check) => check.name)
  const failing = named("fail")
  const pending = named("pending")
  const detail = [
    failing.length > 0 && `failing: ${failing.join(", ")}`,
    pending.length > 0 && `pending: ${pending.join(", ")}`,
  ].filter(Boolean)
  if (counted.length === 0) return { name: "Checks", ok: false, detail: "no checks reported yet" }
  if (detail.length > 0) return { name: "Checks", ok: false, detail: detail.join("; ") }
  const skipped = named("skip").length
  return {
    name: required.length > 0 ? "Required checks" : "Checks",
    ok: true,
    detail: `${named("pass").length} passed${skipped > 0 ? `, ${skipped} skipped` : ""}`,
  }
}

function reviewerGate(name, login, { reviews, threads }) {
  const decisive = reviews
    .filter((review) => review.author === login && review.state !== "COMMENTED")
    .at(-1)?.state
  const unresolved = threads.filter((thread) => thread.author === login && !thread.isResolved)
  const changesRequested = decisive === "CHANGES_REQUESTED"
  const problems = [
    changesRequested && "changes requested",
    unresolved.length > 0 && `${plural(unresolved.length, "unresolved thread")}`,
  ].filter(Boolean)
  if (problems.length > 0) return { name, ok: false, detail: problems.join(", ") }
  if (decisive === "APPROVED") return { name, ok: true, detail: "approved" }
  const reviewed = reviews.some((review) => review.author === login)
  return { name, ok: true, detail: reviewed ? "reviewed, threads resolved" : "no review" }
}

function convexGate(files) {
  const touched = files.filter((file) => file.startsWith("convex/"))
  return touched.length > 0
    ? {
        name: "Convex",
        ok: false,
        detail: `${plural(touched.length, "file")} in convex/, needs Matthew`,
      }
    : { name: "Convex", ok: true, detail: "no convex/ changes" }
}

/** why: fingerprints.yml keeps its comment only while some target needs a new native build. */
function fingerprintGate({ checks, comments }) {
  const name = "Native fingerprint"
  const check = checks.find((candidate) => candidate.workflow === "native fingerprints")
  if (check?.state === "pending") return { name, ok: false, detail: "fingerprint check running" }
  if (check?.state === "fail") return { name, ok: false, detail: "fingerprint check failed" }
  const comment = comments.find(
    (candidate) =>
      candidate.author === "github-actions" && candidate.body.includes(FINGERPRINT_MARKER),
  )
  if (!comment)
    return { name, ok: true, detail: check ? "no native build needed" : "no native inputs changed" }
  const targets = [...comment.body.matchAll(/^\| (\w+) \| (iOS|Android) \|/gm)].map(
    ([, environment, platform]) => `${environment} ${platform}`,
  )
  return { name, ok: false, detail: `native build needed: ${targets.join(", ")}` }
}

// why: Blacksmith appends <img> badges to every description, so only uploads and media files count.
const MEDIA =
  /github\.com\/user-attachments\/|githubusercontent\.com\/|\.(?:png|jpe?g|gif|webp|mp4|mov|webm)\b/i
const PERF = /\b\d+(?:\.\d+)?\s?(?:ms|fps|kB|KB|MB)\b/

/** why: AGENTS.md asks for images, video, or numbers on app changes; scripts and backend PRs show commands instead. */
function evidenceGate({ body, files }) {
  const name = "Evidence"
  const kinds = [
    MEDIA.test(body) && "screenshots or video",
    PERF.test(body) && "perf numbers",
  ].filter(Boolean)
  if (kinds.length > 0) return { name, ok: true, detail: kinds.join(", ") }
  const appChanged = files.some(
    (file) => file.startsWith("src/") && !/\.test\.|__tests__\//.test(file),
  )
  return appChanged
    ? { name, ok: false, detail: "no screenshots, video, or perf numbers in the description" }
    : { name, ok: true, detail: "not needed, no app changes in src/" }
}

function evaluateGates(pr) {
  return [
    checksGate(pr.checks),
    ...Object.entries(REVIEWERS).map(([name, login]) => reviewerGate(name, login, pr)),
    convexGate(pr.files),
    fingerprintGate(pr),
    evidenceGate(pr),
  ]
}

function renderSummary(gates, headSha) {
  const blocked = gates.filter((gate) => !gate.ok).map((gate) => gate.name)
  return [
    MARKER,
    blocked.length === 0
      ? "**Merge gate: ready**"
      : `**Merge gate: blocked** by ${blocked.join(", ")}`,
    "",
    "| Gate | Result | Detail |",
    "| --- | --- | --- |",
    ...gates.map((gate) => `| ${gate.name} | ${gate.ok ? "pass" : "fail"} | ${gate.detail} |`),
    "",
    `Head \`${headSha.slice(0, 7)}\`. Run \`node scripts/merge-gate.cjs <pr>\` for a fresh read.`,
  ].join("\n")
}

function gh(args, input) {
  const result = spawnSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`)
  return result.stdout
}

function fetchPullRequest(number) {
  const graphql = JSON.parse(
    gh([
      "api",
      "graphql",
      "-F",
      "owner={owner}",
      "-F",
      "name={repo}",
      "-F",
      `number=${number}`,
      "-f",
      `query=${QUERY}`,
    ]),
  )
  const files = gh([
    "api",
    `repos/{owner}/{repo}/pulls/${number}/files`,
    "--paginate",
    "--jq",
    ".[].filename",
  ])
    .split("\n")
    .filter(Boolean)
  return toPullRequest(graphql, files)
}

/** why: --comment is for CI; it edits the newest bot comment, so a local run would add a second one. */
function upsertComment(number, body) {
  const existing = gh([
    "api",
    `repos/{owner}/{repo}/issues/${number}/comments`,
    "--paginate",
    "--jq",
    `.[] | select(.user.type == "Bot" and (.body | contains("${MARKER}"))) | .id`,
  ])
    .split("\n")
    .filter(Boolean)
    .at(-1)
  const [method, endpoint] = existing
    ? ["PATCH", `repos/{owner}/{repo}/issues/comments/${existing}`]
    : ["POST", `repos/{owner}/{repo}/issues/${number}/comments`]
  gh(["api", "-X", method, endpoint, "--input", "-"], JSON.stringify({ body }))
}

function main() {
  const [number, flag] = process.argv.slice(2)
  if (!/^\d+$/.test(number ?? "") || (flag !== undefined && flag !== "--comment")) {
    console.error("Usage: node scripts/merge-gate.cjs <pr> [--comment]")
    process.exitCode = 2
    return
  }
  const pr = fetchPullRequest(number)
  const gates = evaluateGates(pr)
  const summary = renderSummary(gates, pr.headSha)
  console.log(summary)
  if (flag === "--comment") upsertComment(number, summary)
  else if (gates.some((gate) => !gate.ok)) process.exitCode = 1
}

if (require.main === module) main()

module.exports = { evaluateGates, renderSummary, toPullRequest }
