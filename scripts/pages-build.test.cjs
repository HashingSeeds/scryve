const assert = require("node:assert/strict")
const { test } = require("node:test")

const { deployTarget } = require("./pages-build.cjs")

const stagingKey = "dev:quiet-otter-123|secret"
const unreachable = () => assert.fail("main builds never compare against main")

test("only branches whose backend matches main use staging", () => {
  assert.equal(
    deployTarget({ CF_PAGES_BRANCH: "main", CONVEX_STAGING_DEPLOY_KEY: stagingKey }, unreachable),
    "default",
  )
  assert.equal(deployTarget({ CF_PAGES_BRANCH: "fix/x" }, unreachable), "default")
  const branch = { CF_PAGES_BRANCH: "fix/x", CONVEX_STAGING_DEPLOY_KEY: stagingKey }
  assert.equal(
    deployTarget(branch, () => true),
    "staging",
  )
  assert.equal(
    deployTarget(branch, () => false),
    "default",
  )
})

test("a staging key for any other deployment type is rejected only when staging is needed", () => {
  const branch = {
    CF_PAGES_BRANCH: "fix/x",
    CONVEX_STAGING_DEPLOY_KEY: "prod:dashing-curlew-34|secret",
  }
  assert.throws(() => deployTarget(branch, () => true), /dev deployment key/)
  assert.equal(
    deployTarget(branch, () => false),
    "default",
  )
})
