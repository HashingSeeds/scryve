const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const SCRIPT = require.resolve("./pr-preview-unzip.py")
const REGULAR = 0o100644
const SYMLINK = 0o120777

function zipEntriesWithAnyNameOrMode(directory, entries) {
  const archive = path.join(directory, "artifact.zip")
  const result = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      `import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as zf:
    for name, mode in json.loads(sys.argv[2]):
        info = zipfile.ZipInfo(name)
        info.external_attr = mode << 16
        zf.writestr(info, "data")`,
      archive,
      JSON.stringify(entries),
    ],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stderr)
  return archive
}

function unzip(entries) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pr-preview-unzip-"))
  const destination = path.join(directory, "out", "preview-artifact")
  fs.mkdirSync(path.dirname(destination))
  const result = spawnSync(
    "python3",
    ["-I", SCRIPT, zipEntriesWithAnyNameOrMode(directory, entries), destination],
    {
      encoding: "utf8",
    },
  )
  const written = fs.existsSync(destination)
    ? fs.readdirSync(destination, { recursive: true })
    : null
  const escaped = fs
    .readdirSync(directory)
    .filter((name) => !["artifact.zip", "out"].includes(name))
  fs.rmSync(directory, { recursive: true, force: true })
  return { status: result.status, stderr: result.stderr, written, escaped }
}

test("extracts a bundle export into the new destination", () => {
  const result = unzip([
    ["metadata.json", REGULAR],
    ["_expo/static/js/ios/entry-1.hbc", REGULAR],
    ["assets/0a328cd9c1afd0afe8e3b1ec5165b1b4", 0],
  ])
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.written.includes(path.join("_expo", "static", "js", "ios", "entry-1.hbc")))
})

for (const [label, name, mode] of [
  ["traversal in the middle", "x/../../../app.config.ts", REGULAR],
  ["an absolute path", "/tmp/app.config.ts", REGULAR],
  ["a backslash", "x\\..\\app.config.ts", REGULAR],
  ["a symlink", "assets/link", SYMLINK],
]) {
  test(`rejects ${label} before writing anything`, () => {
    const result = unzip([
      ["metadata.json", REGULAR],
      [name, mode],
    ])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /::error::/)
    assert.equal(result.written, null)
    assert.deepEqual(result.escaped, [])
  })
}
