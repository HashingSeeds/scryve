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

function graphql({ body = "", reviews = [], threads = [], comments = [], contexts = [] } = {}) {
  const nodes = (items) => ({ nodes: items })
  return {
    data: {
      repository: {
        pullRequest: {
          headRefOid: "abcdef1234567890",
          body,
          reviews: nodes(reviews.map(([login, state]) => ({ author: { login }, state }))),
          reviewThreads: nodes(
            threads.map(([login, isResolved]) => ({
              isResolved,
              comments: nodes([{ author: { login } }]),
            })),
          ),
          comments: nodes(comments.map(([login, text]) => ({ author: { login }, body: text }))),
          commits: nodes([{ commit: { statusCheckRollup: { contexts: nodes(contexts) } } }]),
        },
      },
    },
  }
}

const gate = (gates, name) => gates.find((candidate) => candidate.name === name)
const passingChecks = [checkRun("checks", "COMPLETED", "SUCCESS")]

test("required checks win over the rest, and the gate ignores its own run", () => {
  const contexts = [
    checkRun("checks", "COMPLETED", "SUCCESS", { required: true }),
    checkRun("export", "COMPLETED", "FAILURE"),
    checkRun("comment", "IN_PROGRESS", null, { workflow: "merge gate" }),
  ]
  const gates = evaluateGates(toPullRequest(graphql({ contexts }), []))
  assert.deepEqual(gate(gates, "Required checks"), {
    name: "Required checks",
    ok: true,
    detail: "1 passed",
  })

  const unrequired = contexts.map((context) => ({ ...context, isRequired: false }))
  unrequired.push({ __typename: "StatusContext", context: "CodeRabbit", state: "PENDING" })
  assert.deepEqual(
    gate(evaluateGates(toPullRequest(graphql({ contexts: unrequired }), [])), "Checks"),
    {
      name: "Checks",
      ok: false,
      detail: "failing: export; pending: CodeRabbit",
    },
  )
})

test("a bot's requested changes stand until it approves, and its open threads block", () => {
  const pr = (reviews, threads = []) =>
    toPullRequest(graphql({ reviews, threads, contexts: passingChecks }), [])
  const coderabbit = (reviews, threads) => gate(evaluateGates(pr(reviews, threads)), "CodeRabbit")

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
  assert.equal(gate(evaluateGates(pr([])), "Codex").detail, "no review")
})

test("convex changes and pending native builds need Matthew", () => {
  const fingerprintComment = [
    "<!-- native-fingerprint-check -->",
    "| Environment | Platform | Fingerprint difference |",
    "| --- | --- | --- |",
    "| Production | iOS | `aaaa` → `bbbb` |",
  ].join("\n")
  const gates = evaluateGates(
    toPullRequest(
      graphql({
        contexts: passingChecks,
        comments: [
          ["github-actions", fingerprintComment],
          ["mchisolm0", "<!-- native-fingerprint-check -->\n| Preview | Android |"],
        ],
      }),
      ["convex/schema.ts", "convex/decks.ts", "app.json"],
    ),
  )
  assert.equal(gate(gates, "Convex").detail, "2 files in convex/, needs Matthew")
  assert.deepEqual(gate(gates, "Native fingerprint"), {
    name: "Native fingerprint",
    ok: false,
    detail: "native build needed: Production iOS",
  })
})

test("app changes need uploaded media or perf numbers, not badge images", () => {
  const evidence = (body, files) =>
    gate(
      evaluateGates(toPullRequest(graphql({ body, contexts: passingChecks }), files)),
      "Evidence",
    )
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
