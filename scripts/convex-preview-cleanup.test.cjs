const assert = require("node:assert/strict")
const { test } = require("node:test")

const { branchForPreview, isStale, UNPUSHED_GRACE_MS } = require("./convex-preview-cleanup.cjs")
const { previewName } = require("./preview.cjs")

test("a preview stays while its branch has an open PR or none yet, or is unpushed and recently deployed", () => {
  const young = UNPUSHED_GRACE_MS - 1
  const old = UNPUSHED_GRACE_MS + 1
  for (const [branch, branchExists, prStates, idleMs, stale] of [
    ["fix/x", false, ["closed"], young, true],
    ["t3-abc", false, [], young, false],
    ["t3-abc", false, [], old, true],
    ["fix/x", true, ["closed"], young, true],
    ["fix/x", true, ["closed", "open"], old, false],
    ["t3-abc", true, [], old, false],
    ["main", true, [], young, true],
    ["production", true, [], young, true],
  ])
    assert.equal(
      isStale({ branch, branchExists, prStates, idleMs }),
      stale,
      `${branch} ${branchExists} ${prStates} ${idleMs}`,
    )
})

test("a preview from pnpm preview:up maps back to its branch", () => {
  const branches = ["main", "qa/full-pass"]
  assert.equal(branchForPreview(previewName("qa/full-pass"), branches), "qa/full-pass")
  assert.equal(branchForPreview("feat/app-rubik", branches), "feat/app-rubik")
})
