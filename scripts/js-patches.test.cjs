const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

// why: the native fingerprint hashes patches/ but not js-patches/, so a patch here ships by OTA.
// It must not touch anything a binary is built from: no native files, no autolinked packages.
const root = path.join(__dirname, "..")
const patchDir = path.join(root, "js-patches")
const NATIVE_MARKERS = ["ios", "android", "apple", "expo-module.config.json"]
const JS_SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/

for (const file of fs.readdirSync(patchDir).filter((name) => name.endsWith(".patch"))) {
  const packageName = file.slice(0, file.lastIndexOf("@")).replace("__", "/")

  test(`${file} patches only JS in a package without native code`, () => {
    const patch = fs.readFileSync(path.join(patchDir, file), "utf8")
    const changedFiles = [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map(([, name]) => name)
    assert.ok(changedFiles.length > 0, "no files in patch")
    assert.deepEqual(
      changedFiles.filter((name) => !JS_SOURCE.test(name)),
      [],
      "non-JS files belong in patches/",
    )

    const packageDir = path.join(root, "node_modules", packageName)
    assert.ok(fs.existsSync(packageDir), `${packageName} is not installed`)
    assert.deepEqual(
      NATIVE_MARKERS.filter((marker) => fs.existsSync(path.join(packageDir, marker))),
      [],
      `${packageName} has native code; its patch belongs in patches/`,
    )
  })
}
