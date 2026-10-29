const assert = require("node:assert/strict")
const { test } = require("node:test")

const { branchForPreview, isStale } = require("./convex-preview-cleanup.cjs")
const { previewName } = require("./preview.cjs")

test("a preview stays only while its branch exists with an open PR or none yet, and never for main or production", () => {
  for (const [branch, branchExists, prStates, stale] of [
    ["fix/x", false, ["closed"], true],
    ["t3-abc", false, [], true],
    ["fix/x", true, ["closed"], true],
    ["fix/x", true, ["closed", "open"], false],
    ["t3-abc", true, [], false],
    ["main", true, [], true],
    ["production", true, [], true],
  ])
    assert.equal(isStale({ branch, branchExists, prStates }), stale, `${branch} ${prStates}`)
})

test("a preview from pnpm preview:up maps back to its branch", () => {
  const branches = ["main", "qa/full-pass"]
  assert.equal(branchForPreview(previewName("qa/full-pass"), branches), "qa/full-pass")
  assert.equal(branchForPreview("feat/app-rubik", branches), "feat/app-rubik")
})
