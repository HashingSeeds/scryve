const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const { buildCommand, nasCommand, parseArgs, uploadCommand } = require("./native.cjs")

const root = path.join(__dirname, "..")

test("a bare target builds into build/", () => {
  assert.deepEqual(parseArgs(["ios:preview"]), {
    target: "ios:preview",
    build: true,
    upload: false,
    nas: false,
    buildPath: path.join(root, "build", "ios-preview.ipa"),
  })
})

test("--upload skips the build and --ship does both", () => {
  assert.equal(parseArgs(["android:production", "--upload"]).build, false)
  const ship = parseArgs(["android:production", "--ship"])
  assert.equal(ship.build && ship.upload, true)
})

test("--nas puts the artifact on the NAS, after a build only with --build", () => {
  assert.equal(parseArgs(["ios:development", "--nas"]).build, false)
  const options = parseArgs(["ios:development", "--build", "--nas"])
  assert.equal(options.build, true)
  assert.deepEqual(nasCommand(options), [
    "builds",
    "put",
    path.join(root, "build", "ios-dev.ipa"),
    "--platform",
    "ios",
    "--profile",
    "development:device",
  ])
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

test("ios:profile builds with Xcode under the preview environment and never goes to EAS", () => {
  const options = parseArgs(["ios:profile", "--build", "--nas"])
  assert.equal(buildCommand(options).at(-1), "sh scripts/ios-profile.sh")
  assert.equal(buildCommand(options).at(-3), "preview")
  assert.deepEqual(nasCommand(options).slice(-2), ["--profile", "profile"])
  assert.throws(() => parseArgs(["ios:profile", "--ship"]), /cannot --upload/)
})
