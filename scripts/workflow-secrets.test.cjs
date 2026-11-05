const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const workflows = path.join(
  path.dirname(require.resolve("./workflow-secrets.test.cjs")),
  "..",
  ".github",
  "workflows",
)

const RELEASE_WORKFLOWS = ["beta.yml", "fingerprint-drift.yml", "promote.yml"]

test("only release workflows read EXPO_TOKEN, which can publish production updates", () => {
  const readers = fs
    .readdirSync(workflows)
    .filter((file) =>
      /\bsecrets\.EXPO_TOKEN\b/.test(fs.readFileSync(path.join(workflows, file), "utf8")),
    )
  assert.deepEqual(readers.toSorted(), RELEASE_WORKFLOWS)
})
