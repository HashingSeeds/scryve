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

const readsExpoToken = (source) =>
  /\bsecrets(?:\.EXPO_TOKEN\b|\[\s*['"]EXPO_TOKEN['"]\s*\])|toJSON\(\s*secrets\s*\)/.test(source)

test("only release workflows read EXPO_TOKEN, which can publish production updates", () => {
  const readers = fs
    .readdirSync(workflows)
    .filter((file) => readsExpoToken(fs.readFileSync(path.join(workflows, file), "utf8")))
  assert.deepEqual(readers.toSorted(), RELEASE_WORKFLOWS)
})

test("every way of reading EXPO_TOKEN counts", () => {
  for (const source of [
    "${{ secrets.EXPO_TOKEN }}",
    "${{ secrets['EXPO_TOKEN'] }}",
    '${{ secrets["EXPO_TOKEN"] }}',
    "${{ toJSON(secrets) }}",
  ])
    assert.equal(readsExpoToken(source), true, source)
  assert.equal(readsExpoToken("${{ secrets.EXPO_TOKEN_PR }}"), false)
})
