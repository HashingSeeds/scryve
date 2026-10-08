const assert = require("node:assert/strict")
const { test } = require("node:test")

const { evaluateGates, renderSummary, toPullRequest } = require("./merge-gate.cjs")

const checkRun = (name, status, conclusion, { required = false, workflow = "checks" } = {}) => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
  isRequired: required,
  checkSuite: { workflowRun: workflow ? { workflow: { name: workflow } } : null },
})

const jobNames = { "checks": "checks", "native fingerprints": "check" }
const completedRun = (
  name,
  conclusion = "success",
  { created = "2026-10-08T12:00:00Z", started = created, job = conclusion } = {},
) => ({
  name,
  event: "pull_request",
  status: "completed",
  conclusion,
  created_at: created,
  run_started_at: started,
  jobs: [{ name: jobNames[name], conclusion: job }],
})

function pullRequest({
  body = "",
  reviews = [],
  threads = [],
  comments = [],
  contexts = [checkRun("checks", "COMPLETED", "SUCCESS")],
  more = {},
  files = [],
  changedFiles = files.length,
  runs = [completedRun("checks")],
  packageJsons = null,
} = {}) {
  const connection = (items, key) => ({
    nodes: items,
    pageInfo: { hasNextPage: more[key] === true, hasPreviousPage: more[key] === true },
  })
  const graphql = {
    data: {
      repository: {
        pullRequest: {
          headRefOid: "abcdef1234567890",
          changedFiles,
          body,
          reviews: connection(
            reviews.map(([login, state]) => ({ author: { login }, state })),
            "reviews",
          ),
          reviewThreads: connection(
            threads.map(([login, isResolved]) => ({
              isResolved,
              comments: { nodes: [{ author: { login } }] },
            })),
            "threads",
          ),
          comments: connection(
            comments.map(([login, text]) => ({ author: { login }, body: text })),
            "comments",
          ),
          commits: {
            nodes: [
              { commit: { statusCheckRollup: { contexts: connection(contexts, "checks") } } },
            ],
          },
        },
      },
    },
  }
  const restFiles = files.map((file) =>
    typeof file === "string"
      ? { filename: file }
      : { filename: file[1], previous_filename: file[0] },
  )
  return toPullRequest(graphql, restFiles, runs, packageJsons)
}

const gates = (options) => evaluateGates(pullRequest(options))
const gate = (options, name) => gates(options).find((candidate) => candidate.name === name)
const ready = (options) => gates(options).every((candidate) => candidate.ok)

test("required checks win over the rest", () => {
  const contexts = [
    checkRun("checks", "COMPLETED", "SUCCESS", { required: true }),
    checkRun("export", "COMPLETED", "FAILURE"),
  ]
  assert.deepEqual(gate({ contexts }, "Required checks"), {
    name: "Required checks",
    ok: true,
    detail: "1 passed",
  })

  const unrequired = contexts.map((context) => ({ ...context, isRequired: false }))
  unrequired.push({ __typename: "StatusContext", context: "CodeRabbit", state: "PENDING" })
  assert.deepEqual(gate({ contexts: unrequired }, "Checks"), {
    name: "Checks",
    ok: false,
    detail: "failing: export; pending: CodeRabbit",
  })
})

test("a green status is not ready while an expected workflow has not reported", () => {
  const contexts = [{ __typename: "StatusContext", context: "Cloudflare Pages", state: "SUCCESS" }]
  assert.equal(ready({ contexts, runs: [] }), false)
  assert.deepEqual(gate({ contexts, runs: [] }, "Workflows"), {
    name: "Workflows",
    ok: false,
    detail: "checks has not started",
  })
  const queued = { ...completedRun("checks"), status: "queued", conclusion: null }
  assert.equal(gate({ contexts, runs: [queued] }, "Workflows").detail, "checks is queued")
  assert.equal(
    gate({ files: ["app.json"], runs: [completedRun("checks")] }, "Workflows").detail,
    "native fingerprints has not started",
  )
})

test("only a successful newest run of each expected workflow counts", () => {
  const contexts = [{ __typename: "StatusContext", context: "Cloudflare Pages", state: "SUCCESS" }]
  assert.equal(ready({ contexts, runs: [completedRun("checks", "cancelled")] }), false)
  assert.equal(
    gate({ contexts, runs: [completedRun("checks", "cancelled")] }, "Workflows").detail,
    "checks cancelled",
  )
  const newer = [
    completedRun("checks", "success", { created: "2026-10-08T12:00:00Z" }),
    completedRun("checks", "failure", { created: "2026-10-08T12:05:00Z" }),
  ]
  assert.equal(gate({ runs: newer }, "Workflows").detail, "checks failure")

  const rerunOfOlder = [
    completedRun("checks", "success", { created: "2026-10-08T12:05:00Z" }),
    completedRun("checks", "cancelled", {
      created: "2026-10-08T12:00:00Z",
      started: "2026-10-08T12:10:00Z",
    }),
  ]
  assert.equal(ready({ runs: rerunOfOlder }), false)
  assert.equal(gate({ runs: rerunOfOlder }, "Workflows").detail, "checks cancelled")
})

test("a successful workflow whose mandatory job was skipped does not count", () => {
  const runs = [completedRun("checks", "success", { job: "skipped" })]
  assert.equal(ready({ runs }), false)
  assert.equal(gate({ runs }, "Workflows").detail, "checks job checks skipped")
  const fingerprintRuns = [
    completedRun("checks"),
    completedRun("native fingerprints", "success", { job: "skipped" }),
  ]
  assert.equal(
    gate({ files: ["app.json"], runs: fingerprintRuns }, "Workflows").detail,
    "native fingerprints job check skipped",
  )
  const matrix = {
    ...completedRun("checks"),
    jobs: [
      { name: "checks", conclusion: "success" },
      { name: "checks", conclusion: "skipped" },
    ],
  }
  assert.equal(gate({ runs: [matrix] }, "Workflows").detail, "checks job checks skipped")
})

test("changes to workflows, checker config, or the gate itself need Matthew", () => {
  assert.equal(ready({ files: [".github/workflows/checks.yml"] }), false)
  assert.deepEqual(gate({ files: ["scripts/merge-gate.cjs"] }, "CI config"), {
    name: "CI config",
    ok: false,
    detail: "CI config changed, needs Matthew: scripts/merge-gate.cjs",
  })
  for (const file of [
    "tsconfig.json",
    "test/test-tsconfig.json",
    ".eslintrc.js",
    "src/.eslintrc.json",
    "src/game/.eslintignore",
    "workers/x/eslint.config.mjs",
    "eslint.config.mjs",
    ".eslint-comments-baseline.json",
    "tools/eslint-plugin-self-explanatory-code/index.cjs",
    "jest.config.js",
    ".dependency-cruiser.js",
    "scripts/bundle-size.cjs",
    "scripts/bundle-size-budget.json",
    "fingerprint.config.js",
    ".fingerprintignore",
  ])
    assert.equal(gate({ files: [file] }, "CI config").ok, false, file)
  assert.equal(gate({ files: ["src/a.ts", "scripts/preview.cjs"] }, "CI config").ok, true)
})

test("package.json blocks only when its scripts change", () => {
  const base = { scripts: { compile: "tsc", lint: "eslint ." }, dependencies: { a: "1" } }
  const bumped = { scripts: { lint: "eslint .", compile: "tsc" }, dependencies: { a: "2" } }
  const noop = { ...base, scripts: { ...base.scripts, compile: "true" } }
  const ciConfig = (head) =>
    gate({ files: ["package.json"], packageJsons: { base, head } }, "CI config")
  assert.equal(ciConfig(bumped).ok, true)
  assert.equal(ready({ files: ["package.json"], packageJsons: { base, head: noop } }), false)
  assert.equal(ciConfig(noop).detail, "CI config changed, needs Matthew: package.json scripts")
})

test("a bot's requested changes stand until it approves, and its open threads block", () => {
  const coderabbit = (reviews, threads) => gate({ reviews, threads }, "CodeRabbit")
  assert.equal(
    coderabbit([
      ["coderabbitai", "CHANGES_REQUESTED"],
      ["coderabbitai", "COMMENTED"],
    ]).detail,
    "changes requested",
  )
  assert.deepEqual(
    coderabbit(
      [
        ["coderabbitai", "CHANGES_REQUESTED"],
        ["coderabbitai", "APPROVED"],
      ],
      [
        ["coderabbitai", false],
        ["coderabbitai", true],
        ["mchisolm0", false],
      ],
    ),
    { name: "CodeRabbit", ok: false, detail: "1 unresolved thread" },
  )
  assert.equal(gate({}, "Codex").detail, "no review")
})

test("more threads than one page cannot be verified, so the gate blocks", () => {
  const threads = Array.from({ length: 100 }, () => ["chatgpt-codex-connector", true])
  assert.equal(ready({ threads }), true)
  assert.equal(ready({ threads, more: { threads: true } }), false)
  assert.deepEqual(gate({ threads, more: { threads: true, comments: true } }, "Completeness"), {
    name: "Completeness",
    ok: false,
    detail: "too many review threads, comments to verify",
  })
})

test("a file list shorter than the PR's changed file count blocks", () => {
  const files = ["README.md"]
  assert.equal(ready({ files, changedFiles: 3001 }), false)
  assert.equal(
    gate({ files, changedFiles: 3001 }, "Completeness").detail,
    "too many changed files to verify",
  )
})

test("convex changes need Matthew, including files renamed out of convex/", () => {
  assert.equal(
    gate({ files: ["convex/schema.ts", "convex/decks.ts"] }, "Convex").detail,
    "2 files in convex/, needs Matthew",
  )
  assert.equal(gate({ files: [["convex/decks.ts", "src/decks.ts"]] }, "Convex").ok, false)
})

test("native input changes need a passing fingerprint check with no build pending", () => {
  const runs = [completedRun("checks"), completedRun("native fingerprints", "skipped")]
  const fingerprint = (options) =>
    gate({ files: ["package.json"], runs, ...options }, "Native fingerprint")
  const contexts = (conclusion) => [
    checkRun("checks", "COMPLETED", "SUCCESS"),
    checkRun("check", "COMPLETED", conclusion, { workflow: "native fingerprints" }),
  ]

  assert.equal(ready({ files: ["package.json"], runs }), false)
  assert.deepEqual(fingerprint({}), {
    name: "Native fingerprint",
    ok: false,
    detail: "native inputs changed, fingerprint check missing",
  })
  assert.equal(
    fingerprint({ contexts: contexts("SKIPPED") }).detail,
    "native inputs changed, fingerprint check skip",
  )
  assert.equal(fingerprint({ contexts: contexts("SUCCESS") }).detail, "no native build needed")

  const buildComment = [
    "<!-- native-fingerprint-check -->",
    "| Environment | Platform | Fingerprint difference |",
    "| --- | --- | --- |",
    "| Production | iOS | `aaaa` → `bbbb` |",
  ].join("\n")
  assert.equal(
    fingerprint({
      contexts: contexts("SUCCESS"),
      comments: [
        ["github-actions", buildComment],
        ["mchisolm0", "<!-- native-fingerprint-check -->\n| Preview | Android |"],
      ],
    }).detail,
    "native build needed: Production iOS",
  )
})

test("app changes need uploaded media or perf numbers, not badge images", () => {
  const evidence = (body, files) => gate({ body, files }, "Evidence")
  const badge = '<img alt="View with [code]smith" src="https://example.com/badge.svg">'

  assert.equal(evidence(badge, ["src/app/index.tsx"]).ok, false)
  assert.equal(evidence(badge, ["src/app/index.test.tsx", "scripts/x.cjs"]).ok, true)
  assert.equal(
    evidence('<img src="https://github.com/user-attachments/assets/1">', ["src/a.tsx"]).detail,
    "screenshots or video",
  )
  assert.equal(evidence("Commits drop from 42 ms to 11 ms.", ["src/a.tsx"]).detail, "perf numbers")
})

test("summary names every blocking gate", () => {
  const summary = renderSummary(
    [
      { name: "Checks", ok: true, detail: "3 passed" },
      { name: "Convex", ok: false, detail: "1 file in convex/, needs Matthew" },
    ],
    "abcdef1234567890",
  )
  assert.match(summary, /^<!-- merge-gate -->\n\*\*Merge gate: blocked\*\* by Convex\n/)
  assert.match(summary, /\| Convex \| fail \| 1 file in convex\/, needs Matthew \|/)
  assert.match(summary, /Head `abcdef1`/)
})
