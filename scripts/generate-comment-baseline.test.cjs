const { Linter } = require("eslint")
const assert = require("node:assert/strict")
const { test } = require("node:test")

const { ruleName, baselineRule } = require("./generate-comment-baseline.cjs")
const plugin = require("../tools/eslint-plugin-self-explanatory-code/index.cjs")

test("baseline recording skips why comments but records narration", () => {
  const linter = new Linter()
  linter.defineRule(ruleName, plugin.rules["prefer-self-explanatory-code"])
  const verify = (code) =>
    linter.verify(code, {
      parserOptions: { ecmaVersion: 2022 },
      rules: { [ruleName]: baselineRule },
    })

  assert.deepEqual(verify("// why: the upstream API needs this\nconst x = 1"), [])
  const [message] = verify("// set x\nconst x = 1")
  assert.ok(message.message.startsWith(plugin.BASELINE_PREFIX))
})
