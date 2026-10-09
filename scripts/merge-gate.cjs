/**
 * why: intentionally local-only. Whoever lands a PR (the land skill, with its own gh auth) runs
 * main's copy: `node scripts/merge-gate.cjs <pr> [--comment] [--merge]`. A workflow that comments
 * on fork PRs needs a privileged trigger like pull_request_target, which is easy to make unsafe in
 * a later edit. --merge squash-merges only the head commit the gates checked.
 */
const { spawnSync } = require("node:child_process")
const { isDeepStrictEqual } = require("node:util")

const MARKER = "<!-- merge-gate -->"
const FINGERPRINT_MARKER = "<!-- native-fingerprint-check -->"
const FINGERPRINT_WORKFLOW = "native fingerprints"
// why: a workflow still succeeds when its jobs are skipped, so each expected workflow names the job that must pass.
const MANDATORY_JOBS = { checks: "checks", [FINGERPRINT_WORKFLOW]: "check" }
// why: changing what the checks run, or what feeds the fingerprint, could turn a failing PR green.
const CI_CONFIG = [
  /^\.github\//,
  /^\.coderabbit\.ya?ml$/,
  /^scripts\/(?:merge-gate\.cjs|bundle-size\.cjs|bundle-size-budget\.json)$/,
  /(?:^|\/)[^/]*tsconfig[^/]*\.json$/,
  /(?:^|\/)(?:\.eslintrc[^/]*|eslint\.config\.[^/]+|\.eslintignore)$/,
  /^\.eslint-comments-baseline\.json$/,
  /^tools\/eslint-plugin-/,
  /^jest\.config\./,
  /^\.dependency-cruiser\.js$/,
  /^(?:fingerprint\.config\.js|\.fingerprintignore)$/,
]
// why: mirrors the paths: trigger of fingerprints.yml, so keep the two in sync.
const NATIVE_INPUT =
  /^(?:package\.json|pnpm-lock\.yaml|app\.json|app\.config\.ts|eas\.json|(?:patches|assets|modules)\/)/
/**
 * why: Convex bundles npm packages into production functions at merge, and beta.yml runs their
 * install scripts in the job that holds the deploy key.
 */
const DEPENDENCIES = /^(?:pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.pnpmfile\.cjs|patches\/)/
// why: the repo is public, so only same-repo PRs from these authors can land without Matthew.
const AUTHORS = ["mchisolm0"]
// why: the paid CodeRabbit plan reviews every PR, so its review is required; the others advise.
const CODERABBIT = { login: "coderabbitai", app: "coderabbitai[bot]", context: "CodeRabbit" }
const ADVISORY_REVIEWERS = { Codex: "chatgpt-codex-connector", Macroscope: "macroscopeapp" }
// why: Matthew sets this repository variable to "off" to stop agent merges without a code change.
const KILL_SWITCH = "AGENT_LAND"
const LANDED_LABEL = "agent-landed"

const QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      baseRefOid
      headRefOid
      isCrossRepository
      author { login }
      changedFiles
      body
      reviews(last: 100) {
        pageInfo { hasPreviousPage }
        nodes { author { login } state commit { oid } }
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

/** why: a re-run keeps its created_at, so the latest attempt is the one that started last. */
function latestRuns(workflowRuns) {
  const newestFirst = workflowRuns
    .filter((run) => run.event === "pull_request" && run.name in MANDATORY_JOBS)
    .toSorted((a, b) =>
      (b.run_started_at ?? b.created_at).localeCompare(a.run_started_at ?? a.created_at),
    )
  return Object.keys(MANDATORY_JOBS).flatMap(
    (name) => newestFirst.find((run) => run.name === name) ?? [],
  )
}

function toPullRequest(graphql, { restFiles, workflowRuns, packageJsons, statuses, killSwitch }) {
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
    author: pr.author?.login ?? null,
    crossRepository: pr.isCrossRepository,
    killSwitch,
    // why: anyone with write access can post a "CodeRabbit" status, so only the app's own count.
    coderabbitStatuses: statuses
      .filter(
        ({ context, creator }) =>
          context === CODERABBIT.context && creator?.login === CODERABBIT.app,
      )
      .map(({ state, description }) => ({ state, description })),
    body: pr.body ?? "",
    truncated: Object.keys(pages).filter((key) => pages[key]),
    // why: a rename lists its old path only as previous_filename, and moving a file out of convex/ still changes convex/.
    files: restFiles.flatMap((file) => [file.filename, file.previous_filename ?? []].flat()),
    packageScriptsChanged:
      packageJsons !== null &&
      !isDeepStrictEqual(packageJsons.base?.scripts, packageJsons.head?.scripts),
    workflowRuns: latestRuns(workflowRuns).map(({ name, status, conclusion, jobs }) => ({
      name,
      status,
      conclusion,
      jobs: jobs.map((job) => ({ name: job.name, conclusion: job.conclusion })),
    })),
    reviews: pr.reviews.nodes.map((review) => ({
      author: review.author?.login,
      state: review.state,
      commit: review.commit?.oid ?? null,
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
    if (newest.conclusion !== "success") return [`${name} ${newest.conclusion.replace(/_/g, " ")}`]
    const job = MANDATORY_JOBS[name]
    // why: a matrix can give several jobs the same explicit name, and every leg has to pass.
    const conclusions = newest.jobs
      .filter((candidate) => candidate.name === job)
      .map((candidate) => candidate.conclusion)
    const failed = conclusions.length === 0 ? "missing" : conclusions.find((c) => c !== "success")
    return failed === undefined ? [] : [`${name} job ${job} ${failed}`]
  })
  return problems.length > 0
    ? { name: "Workflows", ok: false, detail: problems.join("; ") }
    : { name: "Workflows", ok: true, detail: `${expected.join(", ")} succeeded` }
}

function checksGate(checks) {
  const required = checks.filter((check) => check.required)
  // why: main has no required checks today, so every check counts until a ruleset marks some.
  const counted = required.length > 0 ? required : checks
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

function reviewerProblems(login, { reviews, threads }) {
  const decisive = reviews
    .filter((review) => review.author === login && review.state !== "COMMENTED")
    .at(-1)
  const unresolved = threads.filter((thread) => thread.author === login && !thread.isResolved)
  return {
    decisive,
    problems: [
      decisive?.state === "CHANGES_REQUESTED" && "changes requested",
      unresolved.length > 0 && `${plural(unresolved.length, "unresolved thread")}`,
    ].filter(Boolean),
  }
}

function advisoryReviewerGate(name, login, pr) {
  const { decisive, problems } = reviewerProblems(login, pr)
  if (problems.length > 0) return { name, ok: false, detail: problems.join(", ") }
  if (decisive?.state === "APPROVED") return { name, ok: true, detail: "approved" }
  const reviewed = pr.reviews.some((review) => review.author === login)
  return { name, ok: true, detail: reviewed ? "reviewed, threads resolved" : "no review" }
}

/**
 * why: CodeRabbit's status reads success when it was rate limited, and `@coderabbitai resolve`
 * approves a commit it never read. Only its "Review completed" status on the head commit means
 * it reviewed the code being merged.
 */
function coderabbitGate(pr) {
  const name = "CodeRabbit"
  const head = pr.headSha.slice(0, 7)
  const latest = pr.coderabbitStatuses[0]
  const { decisive, problems } = reviewerProblems(CODERABBIT.login, pr)
  if (!latest) problems.push(`has not reviewed ${head}, comment \`@coderabbitai review\``)
  else if (latest.state === "pending")
    problems.push(`${latest.description.toLowerCase()} on ${head}`)
  else if (!pr.coderabbitStatuses.some(({ description }) => description === "Review completed"))
    problems.push(
      `no completed review of ${head} (${latest.description}), comment \`@coderabbitai review\``,
    )
  if (problems.length > 0) return { name, ok: false, detail: problems.join(", ") }
  const approved = decisive?.state === "APPROVED" && decisive.commit === pr.headSha
  return { name, ok: true, detail: `${approved ? "approved" : "reviewed"} ${head}` }
}

function authorGate({ author, crossRepository }) {
  const name = "Author"
  if (crossRepository) return { name, ok: false, detail: "opened from a fork, needs Matthew" }
  return AUTHORS.includes(author)
    ? { name, ok: true, detail: `${author}, same repository` }
    : {
        name,
        ok: false,
        detail: `${author ?? "unknown author"} is not on the allowlist, needs Matthew`,
      }
}

function dependencyGate(files) {
  const changed = files.filter((file) => DEPENDENCIES.test(file))
  return changed.length > 0
    ? { name: "Dependencies", ok: false, detail: `${changed.join(", ")} changed, needs Matthew` }
    : { name: "Dependencies", ok: true, detail: "no lockfile, patch, or pnpm config changes" }
}

function killSwitchGate(killSwitch) {
  return killSwitch === "off"
    ? { name: "Agent merges", ok: false, detail: `paused by Matthew (${KILL_SWITCH}=off)` }
    : { name: "Agent merges", ok: true, detail: "allowed" }
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

/** why: a PR could otherwise weaken the workflows, checkers, or script that grade it. */
function ciConfigGate({ files, packageScriptsChanged }) {
  const changed = [
    ...files.filter((file) => CI_CONFIG.some((pattern) => pattern.test(file))),
    ...(packageScriptsChanged ? ["package.json scripts"] : []),
  ]
  return changed.length > 0
    ? {
        name: "CI config",
        ok: false,
        detail: `CI config changed, needs Matthew: ${changed.join(", ")}`,
      }
    : { name: "CI config", ok: true, detail: "no workflow, checker, or merge gate changes" }
}

function evaluateGates(pr) {
  return [
    killSwitchGate(pr.killSwitch),
    authorGate(pr),
    completenessGate(pr.truncated),
    workflowsGate(pr),
    checksGate(pr.checks),
    coderabbitGate(pr),
    ...Object.entries(ADVISORY_REVIEWERS).map(([name, login]) =>
      advisoryReviewerGate(name, login, pr),
    ),
    convexGate(pr.files),
    dependencyGate(pr.files),
    ciConfigGate(pr),
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

function gh(args, input, { allowNotFound = false } = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0 && allowNotFound && result.stderr.includes("HTTP 404")) return null
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
  const workflowRuns = latestRuns(
    pages(`repos/{owner}/{repo}/actions/runs?head_sha=${headSha}&per_page=100`).flatMap(
      (page) => page.workflow_runs,
    ),
  ).map((run) => ({
    ...run,
    jobs: pages(
      `repos/{owner}/{repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    ).flatMap((page) => page.jobs),
  }))
  const { baseRefOid } = graphql.data.repository.pullRequest
  const packageJsonAt = (ref) =>
    JSON.parse(
      gh([
        "api",
        `repos/{owner}/{repo}/contents/package.json?ref=${ref}`,
        "-H",
        "Accept: application/vnd.github.raw",
      ]),
    )
  const packageJsons = files.some((file) => file.filename === "package.json")
    ? { base: packageJsonAt(baseRefOid), head: packageJsonAt(headSha) }
    : null
  // why: newest first, so the first CodeRabbit entry is its current state for this commit.
  const statuses = pages(`repos/{owner}/{repo}/commits/${headSha}/statuses?per_page=100`).flat()
  const killSwitch = gh(
    ["api", `repos/{owner}/{repo}/actions/variables/${KILL_SWITCH}`, "--jq", ".value"],
    undefined,
    { allowNotFound: true },
  )?.trim()
  return toPullRequest(graphql, {
    restFiles: files,
    workflowRuns,
    packageJsons,
    statuses,
    killSwitch: killSwitch ?? null,
  })
}

/** why: a push while the gate ran would make the summary stale, so it writes nothing and fails instead. */
function upsertComment(number, body, headSha) {
  const currentHead = gh([
    "api",
    `repos/{owner}/{repo}/pulls/${number}`,
    "--jq",
    ".head.sha",
  ]).trim()
  if (currentHead !== headSha) {
    console.error(`Head moved to ${currentHead.slice(0, 7)} while checking; run the gate again.`)
    return false
  }
  const viewer = gh(["api", "user", "--jq", ".login"]).trim()
  const existing = gh([
    "api",
    `repos/{owner}/{repo}/issues/${number}/comments`,
    "--paginate",
    "--jq",
    `.[] | select(.user.login == "${viewer}" and (.body | contains("${MARKER}"))) | .id`,
  ])
    .split("\n")
    .filter(Boolean)
    .at(-1)
  const [method, endpoint] = existing
    ? ["PATCH", `repos/{owner}/{repo}/issues/comments/${existing}`]
    : ["POST", `repos/{owner}/{repo}/issues/${number}/comments`]
  gh(["api", "-X", method, endpoint, "--input", "-"], JSON.stringify({ body }))
  return true
}

/**
 * why: --match-head-commit makes GitHub refuse the merge if anyone pushed after the gates ran.
 * No --delete-branch: the repo deletes merged branches and retargets stacked PRs, while gh's
 * flag closed the stacked #311.
 */
function merge(number, headSha) {
  gh(
    ["api", "-X", "POST", `repos/{owner}/{repo}/issues/${number}/labels`, "--input", "-"],
    JSON.stringify({ labels: [LANDED_LABEL] }),
  )
  gh(["pr", "merge", number, "--squash", "--match-head-commit", headSha])
  console.log(`Merged #${number} at ${headSha}.`)
}

function main() {
  const [number, ...flags] = process.argv.slice(2)
  if (
    !/^\d+$/.test(number ?? "") ||
    flags.some((flag) => !["--comment", "--merge"].includes(flag))
  ) {
    console.error("Usage: node scripts/merge-gate.cjs <pr> [--comment] [--merge]")
    process.exitCode = 2
    return
  }
  const pr = fetchPullRequest(number)
  const gates = evaluateGates(pr)
  const summary = renderSummary(gates, pr.headSha)
  console.log(summary)
  const ready = gates.every((gate) => gate.ok)
  // why: a merge always leaves the gate table on the PR as its audit record.
  const comment = flags.includes("--comment") || flags.includes("--merge")
  const written = !comment || upsertComment(number, summary, pr.headSha)
  if (!written || !ready) {
    process.exitCode = 1
    return
  }
  if (flags.includes("--merge")) merge(number, pr.headSha)
}

// why: land pipes main's copy in (`node - <pr>`), where require.main is unset.
if (require.main === module || module.id === "[stdin]") main()

module.exports = { evaluateGates, renderSummary, toPullRequest }
