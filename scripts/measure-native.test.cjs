const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  parseApkListing,
  parseInteractiveMs,
  summarize,
  renderComparison,
} = require("./measure-native.cjs")

test("parseApkListing groups native libraries by ABI and finds the JS bundle", () => {
  const listing = `Archive:  app-release.apk
 Length   Method    Size  Cmpr    Date    Time   CRC-32   Name
--------  ------  ------- ---- ---------- ----- --------  ----
    2048  Defl:N      900  56% 1981-01-01 01:01 0a1b2c3d  AndroidManifest.xml
 5000000  Defl:N  2000000  60% 1981-01-01 01:01 1a1b2c3d  assets/index.android.bundle
  300000  Stored   300000   0% 1981-01-01 01:01 2a1b2c3d  lib/arm64-v8a/libmmkv.so
 1200000  Stored  1200000   0% 1981-01-01 01:01 3a1b2c3d  lib/arm64-v8a/libhermes.so
  310000  Stored   310000   0% 1981-01-01 01:01 4a1b2c3d  lib/x86_64/libmmkv.so
--------          -------  ---                            -------
 6812048          3810900  44%                            5 files`
  assert.deepEqual(parseApkListing(listing), {
    jsBytes: 5_000_000,
    abis: {
      "arm64-v8a": { "libmmkv.so": 300_000, "libhermes.so": 1_200_000 },
      "x86_64": { "libmmkv.so": 310_000 },
    },
  })
})

test("parseInteractiveMs times this app's process fork to the marker", () => {
  const logcat = `1791852000.900  700  712 I ActivityManager: Start proc 3908:com.example/u0a229
1791852001.137  3908  3908 I Zygote  : Process 3908 created for com.example
1791852001.400  3908  3950 I ReactNativeJS: Running "main"
1791852002.512  3908  3950 I ReactNativeJS: scryve:interactive`
  assert.equal(parseInteractiveMs(logcat, "com.example"), 1375)
  assert.equal(parseInteractiveMs(logcat, "com.other"), undefined)
})

test("summarize reports the median and p90 of the runs", () => {
  const { medianMs, p90Ms } = summarize([500, 100, 400, 200, 300, 900, 600, 800, 700, 1000])
  assert.equal(medianMs, 600)
  assert.equal(p90Ms, 1000)
})

test("renderComparison lists changed libraries and the cold start shift", () => {
  const build = (libs, medianMs) => ({
    size: { apkBytes: 30_000_000, jsBytes: 5_000_000, abis: { "arm64-v8a": libs } },
    startup: {
      firstFrame: { medianMs: 400, p90Ms: 450 },
      interactive: { medianMs, p90Ms: medianMs + 100 },
    },
  })
  const table = renderComparison(
    build({ "libmmkv.so": 300_000, "libhermes.so": 1_200_000 }, 900),
    build({ "libmmkv.so": 350_000, "libhermes.so": 1_200_000, "libNitroModules.so": 400_000 }, 880),
  )
  assert.match(table, /\| Native libs, arm64-v8a \| 1,500 KB \| 1,950 KB \| \+450 KB \|/)
  assert.match(table, /\| arm64-v8a \| libNitroModules\.so \| added, 400 KB \|/)
  assert.match(table, /\| arm64-v8a \| libmmkv\.so \| \+50 KB \|/)
  assert.doesNotMatch(table, /libhermes/)
  assert.match(table, /\| Cold start to interactive, median \| 900 ms \| 880 ms \| -20 ms \|/)
})
