/* global __dirname */

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

// why: js-patches/ ships by OTA because the native fingerprint skips it, and react-native keeps native code beside its JS.
const patchDir = path.join(__dirname, "..", "js-patches")
const NATIVE_DIRS = new Set([
  "android",
  "apple",
  "gradle",
  "ios",
  "plugin",
  "React",
  "ReactAndroid",
  "ReactApple",
  "ReactCommon",
  "scripts",
  "sdks",
])
const NATIVE_FILES = new Set(["app.plugin.js", "react-native.config.js"])
const JS_SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/
// why: codegen turns spec files into native code; this is the name filter @react-native/codegen applies.
const CODEGEN_SPEC = /^(Native.+|.+NativeComponent)/

const touchesNative = (file) =>
  !JS_SOURCE.test(file) ||
  NATIVE_FILES.has(path.posix.basename(file)) ||
  CODEGEN_SPEC.test(path.posix.basename(file)) ||
  file.split("/").some((segment) => NATIVE_DIRS.has(segment))

for (const file of fs.readdirSync(patchDir).filter((name) => name.endsWith(".patch"))) {
  test(`${file} patches only JS that ships in the bundle`, () => {
    const patch = fs.readFileSync(path.join(patchDir, file), "utf8")
    const changedFiles = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].flatMap(
      ([, from, to]) => [from, to],
    )
    assert.ok(changedFiles.length > 0, "no files in patch")
    assert.deepEqual(changedFiles.filter(touchesNative), [], "native files belong in patches/")
  })
}
