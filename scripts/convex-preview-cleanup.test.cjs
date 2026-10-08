const assert = require("node:assert/strict")
const { test } = require("node:test")

const { isStale } = require("./convex-preview-cleanup.cjs")

test("a preview is stale once its branch is deleted", () => {
  assert.equal(isStale({ branch: "fix/x", branchExists: false, prStates: ["closed"] }), true)
  assert.equal(isStale({ branch: "t3-abc", branchExists: false, prStates: [] }), true)
})

test("a preview is stale when every PR from its still-existing branch is closed", () => {
  assert.equal(isStale({ branch: "fix/x", branchExists: true, prStates: ["closed"] }), true)
  assert.equal(
    isStale({ branch: "fix/x", branchExists: true, prStates: ["closed", "open"] }),
    false,
  )
})

test("a pushed branch without a PR keeps its preview", () => {
  assert.equal(isStale({ branch: "t3-abc", branchExists: true, prStates: [] }), false)
})

test("previews named after main or production are always stale", () => {
  assert.equal(isStale({ branch: "main", branchExists: true, prStates: [] }), true)
  assert.equal(isStale({ branch: "production", branchExists: true, prStates: [] }), true)
})
