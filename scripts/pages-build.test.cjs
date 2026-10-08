const assert = require("node:assert/strict")
const { test } = require("node:test")

const { deployTarget, packageJsonMatches } = require("./pages-build.cjs")

const stagingKey = "dev:quiet-otter-123|secret"
const unreachable = () => assert.fail("this build never compares against main")

test("production builds the web app without deploying Convex", () => {
  assert.equal(
    deployTarget(
      { CF_PAGES_BRANCH: "production", CONVEX_STAGING_DEPLOY_KEY: stagingKey },
      unreachable,
    ),
    "none",
  )
})

test("only branches whose backend matches main use staging", () => {
  assert.equal(
    deployTarget({ CF_PAGES_BRANCH: "main", CONVEX_STAGING_DEPLOY_KEY: stagingKey }, () => true),
    "staging",
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

test("a version bump alone keeps a branch on shared staging", () => {
  const pkg = (version, convex) => JSON.stringify({ version, dependencies: { convex } })
  assert.equal(packageJsonMatches(pkg("0.1.2", "1.0.0"), pkg("0.1.1", "1.0.0")), true)
  assert.equal(packageJsonMatches(pkg("0.1.2", "1.1.0"), pkg("0.1.2", "1.0.0")), false)
})
