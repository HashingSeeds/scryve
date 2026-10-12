const assert = require("node:assert/strict")
const { test } = require("node:test")

const { isKnownScriptPhaseWarning } = require("./quiet-pod-script-phases.cjs")

const warning = (pod, count) =>
  `[INSTALL_PODS] [!] ${pod} has added ${count} script phase${count === 1 ? "" : "s"}. Please inspect before executing a build. See \`https://guides.cocoapods.org/syntax/podspec.html#script_phases\` for more information.`

test("hides inspected pods at their known count, including colored output", () => {
  assert.equal(isKnownScriptPhaseWarning(warning("ExpoCamera", 2)), true)
  assert.equal(isKnownScriptPhaseWarning(warning("hermes-engine", 1)), true)
  assert.equal(isKnownScriptPhaseWarning(`\x1b[33m${warning("ExpoImage", 2)}\x1b[39m`), true)
})

test("keeps new pods, changed counts, and other output", () => {
  assert.equal(isKnownScriptPhaseWarning(warning("SomeNewPod", 1)), false)
  assert.equal(isKnownScriptPhaseWarning(warning("ExpoCamera", 3)), false)
  assert.equal(isKnownScriptPhaseWarning("[INSTALL_PODS] Pod installation complete!"), false)
})
