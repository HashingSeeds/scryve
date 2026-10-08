const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { measure, parseReport, renderComment } = require("./bundle-size.cjs")

const limits = { ios: 12_650_000, android: 12_850_000, web: 6_600_000 }

test("measure adds up every chunk per platform", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-bundle-size-test-"))
  try {
    const files = {
      ios: { "entry-a.hbc": 300 },
      android: { "entry-b.hbc": 200 },
      web: { "entry-c.js": 100, "index-d.js": 50 },
    }
    for (const [platform, bundles] of Object.entries(files)) {
      const platformDir = path.join(dir, "_expo", "static", "js", platform)
      fs.mkdirSync(platformDir, { recursive: true })
      for (const [name, size] of Object.entries(bundles))
        fs.writeFileSync(path.join(platformDir, name), "x".repeat(size))
    }
    assert.deepEqual(measure(dir), { ios: 300, android: 200, web: 150 })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("comment shows the change against main and flags bundles over budget", () => {
  const comment = renderComment(
    parseReport({
      head: { ios: 12_045_032, android: 12_257_034, web: 6_700_000 },
      base: { ios: 12_060_000, android: 12_257_100, web: 6_300_000 },
      limits,
    }),
  )
  assert.match(comment, /^<!-- bundle-size -->\n/)
  assert.match(comment, /\| iOS \| 12\.05 MB \| -15 KB \(-0\.1%\) \| 12\.65 MB \|/)
  assert.match(comment, /\| Android \| 12\.26 MB \| no change \| 12\.85 MB \|/)
  assert.match(comment, /\| Web \| 6\.70 MB \| \+400 KB \(\+6\.3%\) \| 6\.60 MB \*\*over\*\* \|/)
  assert.match(comment, /Over budget: Web\./)
})

test("comment without a main baseline still reports sizes", () => {
  const comment = renderComment(
    parseReport({ head: { ios: 1, android: 2, web: 3 }, base: null, limits }),
  )
  assert.match(comment, /no main baseline/)
  assert.doesNotMatch(comment, /Over budget/)
})

test("reports from a fork PR must be plain byte counts", () => {
  assert.throws(
    () => parseReport({ head: { ios: "1 MB", android: 2, web: 3 }, base: null, limits }),
    /head\.ios must be a byte count/,
  )
  assert.throws(() => parseReport({ head: { ios: 1, android: 2, web: 3 } }), /limits must be/)
})
