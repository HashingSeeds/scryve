const assert = require("node:assert/strict")
const { test } = require("node:test")

const { bumpPatch, planVersion } = require("./release-native.cjs")

test("the commit that built a version reuses it for the other platform", () => {
  assert.deepEqual(planVersion({ version: "1.2.3", taggedCommit: "abc", head: "abc" }), {
    action: "reuse",
    version: "1.2.3",
  })
})

test("an untagged version ships as is, so hand-set minor and major bumps stick", () => {
  assert.deepEqual(planVersion({ version: "2.0.0", taggedCommit: null, head: "abc" }), {
    action: "tag",
    version: "2.0.0",
  })
})

test("a newer commit bumps the patch past the released version", () => {
  assert.deepEqual(planVersion({ version: "1.2.9", taggedCommit: "old", head: "new" }), {
    action: "bump",
    version: "1.2.10",
  })
})

test("only plain major.minor.patch versions bump", () => {
  assert.throws(() => bumpPatch("1.2.3-beta.1"), /major\.minor\.patch/)
})
