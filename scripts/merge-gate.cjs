const { spawnSync } = require("node:child_process")

const MARKER = "<!-- merge-gate -->"
const FINGERPRINT_MARKER = "<!-- native-fingerprint-check -->"
const SELF_WORKFLOW = "merge gate"
const FINGERPRINT_WORKFLOW = "native fingerprints"
// why: mirrors the paths: trigger of fingerprints.yml, so keep the two in sync.
const NATIVE_INPUT =
  /^(?:package\.json|pnpm-lock\.yaml|app\.json|app\.config\.ts|eas\.json|(?:patches|assets|modules)\/)/
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
      changedFiles
      body
      reviews(last: 100) {
        pageInfo { hasPreviousPage }
        nodes { author { login } state }
      }
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes { isResolved comments(first: 1) { nodes { author { login } } } }
      }
      comments(last: 100) {
        pageInfo { hasPreviousPage }
        nodes { author { login } body }
      }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                pageInfo { hasNextPage }
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

function toPullRequest(graphql, restFiles, workflowRuns) {
  const pr = graphql.data.repository.pullRequest
  const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup
  const contexts = rollup?.contexts.nodes ?? []
  const pages = {
    "reviews": pr.reviews.pageInfo.hasPreviousPage,
    "review threads": pr.reviewThreads.pageInfo.hasNextPage,
    "comments": pr.comments.pageInfo.hasPreviousPage,
    "checks": rollup?.contexts.pageInfo.hasNextPage ?? false,
    // why: the REST files endpoint stops at 3,000 files even when paginated.
    "changed files": restFiles.length !== pr.changedFiles,
  }
  return {
    headSha: pr.headRefOid,
    body: pr.body ?? "",
    truncated: Object.keys(pages).filter((key) => pages[key]),
    // why: a rename lists its old path only as previous_filename, and moving a file out of convex/ still changes convex/.
    files: restFiles.flatMap((file) => [file.filename, file.previous_filename ?? []].flat()),
    workflowRuns: workflowRuns
      .filter((run) => run.event === "pull_request")
      .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
      .map(({ name, status, conclusion }) => ({ name, status, conclusion })),
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
const changesNativeInputs = (files) => files.some((file) => NATIVE_INPUT.test(file))

/** why: GraphQL pages cap at 100, and an unread page could hide an unresolved thread or failing check. */
function completenessGate(truncated) {
  return truncated.length > 0
    ? { name: "Completeness", ok: false, detail: `too many ${truncated.join(", ")} to verify` }
    : { name: "Completeness", ok: true, detail: "read every review, thread, comment, and check" }
}

/** why: a workflow queued before its first job has no check runs yet, so the rollup alone can look green. */
function workflowsGate({ workflowRuns, files }) {
  const expected = ["checks", ...(changesNativeInputs(files) ? [FINGERPRINT_WORKFLOW] : [])]
  const problems = expected.flatMap((name) => {
    const newest = workflowRuns.find((run) => run.name === name)
    if (!newest) return [`${name} has not started`]
    if (newest.status !== "completed") return [`${name} is ${newest.status.replace(/_/g, " ")}`]
    return newest.conclusion === "success"
      ? []
      : [`${name} ${newest.conclusion.replace(/_/g, " ")}`]
  })
  return problems.length > 0
    ? { name: "Workflows", ok: false, detail: problems.join("; ") }
    : { name: "Workflows", ok: true, detail: `${expected.join(", ")} succeeded` }
}

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

/**
 * why: fingerprints.yml keeps its comment only while some target needs a new native build, and
 * it skips fork and outside-author PRs, so only a passing run proves no build is needed.
 */
function fingerprintGate({ checks, comments, files }) {
  const name = "Native fingerprint"
  const comment = comments.find(
    (candidate) =>
      candidate.author === "github-actions" && candidate.body.includes(FINGERPRINT_MARKER),
  )
  if (!comment) {
    if (!changesNativeInputs(files)) return { name, ok: true, detail: "no native inputs changed" }
    const check = checks.find((candidate) => candidate.workflow === FINGERPRINT_WORKFLOW)
    return check?.state === "pass"
      ? { name, ok: true, detail: "no native build needed" }
      : {
          name,
          ok: false,
          detail: `native inputs changed, fingerprint check ${check?.state ?? "missing"}`,
        }
  }
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
    completenessGate(pr.truncated),
    workflowsGate(pr),
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
  const pages = (endpoint) => JSON.parse(gh(["api", endpoint, "--paginate", "--slurp"]))
  const files = pages(`repos/{owner}/{repo}/pulls/${number}/files?per_page=100`).flat()
  const headSha = graphql.data.repository.pullRequest.headRefOid
  const workflowRuns = pages(
    `repos/{owner}/{repo}/actions/runs?head_sha=${headSha}&per_page=100`,
  ).flatMap((page) => page.workflow_runs)
  return toPullRequest(graphql, files, workflowRuns)
}

/**
 * why: --comment is for CI; it edits the newest bot comment, so a local run would add a second one.
 * It skips the write when a push moved the head, since that push's own run will report.
 */
function upsertComment(number, body, headSha) {
  const currentHead = gh([
    "api",
    `repos/{owner}/{repo}/pulls/${number}`,
    "--jq",
    ".head.sha",
  ]).trim()
  if (currentHead !== headSha) {
    console.log(`Head moved to ${currentHead.slice(0, 7)}; leaving the comment to that run.`)
    return
  }
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
  if (flag === "--comment") upsertComment(number, summary, pr.headSha)
  else if (gates.some((gate) => !gate.ok)) process.exitCode = 1
}

if (require.main === module) main()

module.exports = { evaluateGates, renderSummary, toPullRequest }
