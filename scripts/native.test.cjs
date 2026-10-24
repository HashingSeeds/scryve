const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const { buildCommand, parseArgs, uploadCommand } = require("./native.cjs")

const root = path.join(__dirname, "..")

test("a bare target builds into build/", () => {
  assert.deepEqual(parseArgs(["ios:preview"]), {
    target: "ios:preview",
    build: true,
    upload: false,
    offMain: false,
    buildPath: path.join(root, "build", "ios-preview.ipa"),
  })
})

test("--upload skips the build and --ship does both", () => {
  assert.equal(parseArgs(["android:production", "--upload"]).build, false)
  const ship = parseArgs(["android:production", "--ship"])
  assert.equal(ship.build && ship.upload, true)
})

test("--build-path moves the artifact for build and upload alike", () => {
  const options = parseArgs(["ios:development", "--ship", "--build-path", "/tmp/app.ipa"])
  assert.equal(buildCommand(options).at(-1), "/tmp/app.ipa")
  assert.deepEqual(uploadCommand(options).slice(0, 8), [
    "eas-local",
    "upload",
    "--platform",
    "ios",
    "--profile",
    "development:device",
    "--build-path",
    "/tmp/app.ipa",
  ])
})

test("only iOS builds go through the pod warning filter", () => {
  assert.equal(buildCommand(parseArgs(["ios:development:sim"]))[1], "scripts/quiet-pod-script-phases.cjs")
  assert.equal(buildCommand(parseArgs(["android:development"]))[0], "npx")
})

test("unknown targets and flags print usage", () => {
  assert.throws(() => parseArgs(["ios:prod"]), /Usage/)
  assert.throws(() => parseArgs(["ios:preview", "--submit"]), /Unknown option/)
})

test("--off-main is only for production builds", () => {
  assert.equal(parseArgs(["ios:production", "--off-main"]).offMain, true)
  assert.throws(() => parseArgs(["ios:preview", "--off-main"]), /only applies to production/)
})
