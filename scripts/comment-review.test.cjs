const { Linter } = require("eslint")
const assert = require("node:assert/strict")
const { test } = require("node:test")

const config = require("../.eslintrc.js")
const {
  parseDiff,
  formatEntries,
  parseCheckedEntries,
  removeBlock,
} = require("./comment-review.cjs")
const plugin = require("../tools/eslint-plugin-self-explanatory-code/index.cjs")

const repo = "HashingSeeds/scryve"
const sha = "a".repeat(40)

test("the configured lint rule allows why comments but rejects narration", () => {
  const linter = new Linter()
  const ruleName = "self-explanatory-code/prefer-self-explanatory-code"
  linter.defineRule(ruleName, plugin.rules["prefer-self-explanatory-code"])
  const [, options] = config.rules[ruleName]
  const verify = (code) =>
    linter.verify(code, {
      parserOptions: { ecmaVersion: 2022 },
      rules: { [ruleName]: ["error", { allowPatterns: options.allowPatterns }] },
    })
  for (const code of [
    "// why: the upstream API needs this\nconst x = 1",
    "/* why: the upstream API needs this */ const x = 1",
    "/** why: callers must preload this */ function load() {}",
    "/**\n * why: callers must preload this\n * before rendering\n */\nfunction load() {}",
  ]) {
    assert.deepEqual(verify(code), [], code)
  }
  for (const code of [
    "// set x\nconst x = 1",
    "// elsewhere why: this is not a rationale prefix",
    "/**\n * Set x\n * why: a later line does not qualify\n */",
  ]) {
    assert.equal(verify(code)[0].messageId, "preferCode", code)
  }
})

test("diff parsing collects complete added blocks across files and ignores unchanged comments", () => {
  const sources = {
    "src/a.ts":
      "// why: old\nconst old = 1\n// why: offline state wins\n// retain local values\nconst x = 1\n",
    "src/b.tsx":
      "/**\n * why: callers must preload\n * before rendering\n */\nexport function load() {}\n",
    "scripts/a.cjs": "const x = 1 /* why: inline constraint */\n",
    "scripts/b.mjs": "/** why: single-line usage */\nexport const x = 1\n",
    "src/path with spaces.js": "/* why: block constraint */\nconst x = 1\n",
  }
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -2,0 +3 @@",
    "+// why: offline state wins",
    "diff --git a/src/b.tsx b/src/b.tsx",
    "--- a/src/b.tsx",
    "+++ b/src/b.tsx",
    "@@ -1,0 +2 @@",
    "+ * why: callers must preload",
    "diff --git a/scripts/a.cjs b/scripts/a.cjs",
    "--- a/scripts/a.cjs",
    "+++ b/scripts/a.cjs",
    "@@ -0,0 +1 @@",
    "+const x = 1 /* why: inline constraint */",
    "diff --git a/scripts/b.mjs b/scripts/b.mjs",
    "--- a/scripts/b.mjs",
    "+++ b/scripts/b.mjs",
    "@@ -0,0 +1,2 @@",
    "+/** why: single-line usage */",
    "+export const x = 1",
    "diff --git a/src/path with spaces.js b/src/path with spaces.js",
    "--- a/src/path with spaces.js",
    "+++ b/src/path with spaces.js",
    "@@ -0,0 +1,2 @@",
    "+/* why: block constraint */",
    "+const x = 1",
    "diff --git a/readme.md b/readme.md",
    "+++ b/readme.md",
    "@@ -0,0 +1 @@",
    "+// why: not code",
    "diff --git a/deleted.js b/deleted.js",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-// why: removed",
  ].join("\n")
  const entries = parseDiff(diff, (filename) => sources[filename])
  assert.deepEqual(entries, [
    { path: "src/a.ts", line: 3, block: "// why: offline state wins\n// retain local values" },
    {
      path: "src/b.tsx",
      line: 2,
      block: "/**\n * why: callers must preload\n * before rendering\n */",
    },
    { path: "scripts/a.cjs", line: 1, block: "/* why: inline constraint */" },
    { path: "scripts/b.mjs", line: 1, block: "/** why: single-line usage */" },
    { path: "src/path with spaces.js", line: 1, block: "/* why: block constraint */" },
  ])
  assert.match(formatEntries(entries, repo, sha), /path%20with%20spaces\.js#L1/u)
})

test("strings, templates, JSX text and ordinary comments do not enter the queue", () => {
  const source =
    'const s = "// why: literal"\nconst t = `\n// why: template\n`\nconst el = <div>// why: JSX text</div>\n// set x\nconst x = 1\n'
  const diff = `diff --git a/a.tsx b/a.tsx\n+++ b/a.tsx\n@@ -0,0 +1,7 @@\n${source
    .split("\n")
    .map((line) => `+${line}`)
    .join("\n")}`
  assert.deepEqual(
    parseDiff(diff, () => source),
    [],
  )
  assert.equal(formatEntries([], repo, sha), "")
  assert.deepEqual(
    parseDiff("", () => assert.fail("must not read files")),
    [],
  )
})

test("checked issue entries round-trip fenced blocks and only selected drops apply", () => {
  const entries = [
    { path: "src/a.ts", line: 2, block: "// why: keep this" },
    {
      path: "src/b.ts",
      line: 3,
      block: "/**\n * why: upstream requires ```\n * keep this whole block together\n */",
    },
  ]
  const body = `New why comments landed in main.\n\n${formatEntries(entries, repo, sha)}`.replace(
    "- [ ] drop [src/b.ts",
    "- [x] drop [src/b.ts",
  )
  const checked = parseCheckedEntries(body)
  assert.deepEqual(checked, [entries[1]])
  const source = `const x = 1\n\n${entries[1].block}\nfunction load() {}\n`
  assert.deepEqual(removeBlock(source, checked[0].block), {
    source: "const x = 1\n\nfunction load() {}\n",
    removed: true,
  })
  assert.deepEqual(parseCheckedEntries(body.replace("[x]", "[X]").replace(/\n/gu, "\r\n")), checked)
  assert.deepEqual(parseCheckedEntries(formatEntries(entries, repo, sha)), [])
})

test("removal preserves executable code, indentation and CRLF line endings", () => {
  assert.equal(
    removeBlock(
      "function load() {\n  // why: caller constraint\n  return 1\n}\n",
      "// why: caller constraint",
    ).source,
    "function load() {\n  return 1\n}\n",
  )
  assert.equal(
    removeBlock("const x = 1 /* why: inline */ + 2\n", "/* why: inline */").source,
    "const x = 1  + 2\n",
  )
  assert.equal(
    removeBlock("const x = typeof/* why: adjacent tokens */value\n", "/* why: adjacent tokens */")
      .source,
    "const x = typeof value\n",
  )
  assert.equal(
    removeBlock("/**\r\n * why: CRLF\r\n */\r\nconst x = 1\r\n", "/**\n * why: CRLF\n */").source,
    "const x = 1\r\n",
  )
  assert.equal(removeBlock("// why: final line", "// why: final line").source, "")
})

test("stale, extended, literal and ambiguous blocks are skipped without editing", () => {
  for (const source of [
    "// why: changed\nconst x = 1\n",
    "// why: old\n// newly extended\nconst x = 1\n",
    'const text = "// why: old"\n',
    "// why: old\nconst x = 1\n// why: old\nconst y = 2\n",
  ]) {
    const result = removeBlock(source, "// why: old")
    assert.equal(result.removed, false)
    assert.equal(result.source, source)
  }
})

test("issue paths cannot escape the working tree", () => {
  for (const filename of [
    "../outside.js",
    "/tmp/outside.js",
    "src/../../outside.js",
    "src\\outside.js",
  ]) {
    const body = formatEntries(
      [{ path: filename, line: 1, block: "// why: unsafe" }],
      repo,
      sha,
    ).replace("[ ]", "[x]")
    assert.throws(() => parseCheckedEntries(body), /Invalid comment path/u)
  }
})
