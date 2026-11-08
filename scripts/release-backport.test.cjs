const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  manifestTargets,
  parseManifest,
  parseTarget,
  planTargets,
  unpromoted,
} = require("./release-backport.cjs")

const group = (id, platform, runtime, extra = {}) => ({
  group: id,
  runtime,
  platforms: [platform],
  message: `"Promote ${id}"`,
  isRollBackToEmbedded: false,
  ...extra,
})
const build = (platform, version, number, runtime, commit) => ({
  platform,
  runtime,
  commit,
  version,
  label: `${version} (${number})`,
})

test("targets each runtime production updated, at its newest update, skipping main's", () => {
  const targets = planTargets({
    groups: [
      group("g-new", "ios", "rt-main"),
      group("g-020-late", "ios", "rt-020"),
      group("g-020-early", "ios", "rt-020"),
    ],
    builds: [build("ios", "0.2.0", 42, "rt-020", "c-020")],
    current: { ios: "rt-main" },
  })
  assert.deepEqual(targets, [
    {
      platform: "ios",
      runtime: "rt-020",
      group: "g-020-late",
      buildCommit: "c-020",
      label: "0.2.0 (42)",
    },
  ])
})

test("a runtime that never got an update runs its build, and only a version's newest build counts", () => {
  const targets = planTargets({
    groups: [],
    builds: [
      build("android", "0.2.1", 45, "rt-store", "c-store"),
      build("android", "0.2.1", 44, "rt-tester", "c-tester"),
    ],
    current: {},
  })
  assert.deepEqual(
    targets.map((t) => [t.runtime, t.group, t.buildCommit]),
    [["rt-store", null, "c-store"]],
  )
})

test("a runtime rolled back to its embedded bundle runs its build, not an older update", () => {
  const [target] = planTargets({
    groups: [
      group("g-rollback", "ios", "rt-1", { isRollBackToEmbedded: true }),
      group("g-older", "ios", "rt-1"),
    ],
    builds: [build("ios", "0.1.0", 35, "rt-1", "c-build")],
    current: {},
  })
  assert.equal(target.group, null)
  assert.equal(target.buildCommit, "c-build")
})

test("a manual target needs the full runtime when it names a commit", () => {
  assert.deepEqual(parseTarget("ios:337e20e1"), {
    platform: "ios",
    runtime: "337e20e1",
    commit: undefined,
  })
  assert.throws(() => parseTarget("ios:337e20e1@939f0b40"), /full runtime/)
  assert.equal(parseTarget(`android:${"a".repeat(40)}@939f0b40`).commit, "939f0b40")
})

test("promote skips backports production already has", () => {
  const beta = [
    { message: "Backport abc onto def: fix", groups: ["11111111-1111-1111-1111-111111111111"] },
    { message: "Backport abc onto 123: fix", groups: ["22222222-2222-2222-2222-222222222222"] },
  ]
  const production = [
    '"Promote backport 11111111-1111-1111-1111-111111111111" (1 day ago by robot)',
  ]
  assert.deepEqual(
    unpromoted(beta, production).map((g) => g.groups[0]),
    ["22222222-2222-2222-2222-222222222222"],
  )
})

const IOS = "337e20e19d3f9728c6fa4c787b1259d96aecbc4b"
const ANDROID = "36467da5730996d522efa5fb39836cdffee8514b"

test("a release manifest names each platform's runtime and the commit it was built from", () => {
  const body = [
    "Scryve 0.2.0: Lorcana.",
    "```",
    "git-sha: 939f0b40",
    `runtime-version: ios ${IOS}, android ${ANDROID}`,
    "```",
  ].join("\n")
  assert.deepEqual(parseManifest("v0.2.0", body), [
    { platform: "ios", runtime: IOS, commit: "939f0b40", label: "v0.2.0" },
    { platform: "android", runtime: ANDROID, commit: "939f0b40", label: "v0.2.0" },
  ])
  assert.deepEqual(parseManifest("v0.0.1", "no manifest"), [])
})

test("store runtimes run their newest production update, or their build without one", () => {
  const manifests = [
    { platform: "ios", runtime: "rt-main", commit: "c-022", label: "v0.2.2" },
    { platform: "ios", runtime: "rt-020", commit: "c-020", label: "v0.2.0" },
    { platform: "android", runtime: "rt-011", commit: "c-011", label: "v0.1.1" },
  ]
  const groups = [group("g-late", "ios", "rt-020"), group("g-early", "ios", "rt-020")]
  assert.deepEqual(
    manifestTargets({ manifests, groups, current: { ios: "rt-main" } }).map((t) => [
      t.label,
      t.group,
      t.buildCommit,
    ]),
    [
      ["v0.2.0", "g-late", "c-020"],
      ["v0.1.1", null, "c-011"],
    ],
  )
})
