const assert = require("node:assert/strict")
const { test } = require("node:test")

const { pickRelease, releaseNotes, summarizeGroup } = require("./release-train.cjs")

test("release notes keep player-facing changes in plain words", () => {
  assert.deepEqual(
    releaseNotes([
      "fix(decks): pasted Pokémon cards like Riolu MEG 76 no longer come in unmatched (#303)",
      "fix(tooling): lint:check lints only the files you pass (#304)",
      "chore(web): bump wrangler (#290)",
      "perf: cut cold launch by 23% (#288)",
      "Merge branch 'main'",
    ]),
    [
      "Pasted Pokémon cards like Riolu MEG 76 no longer come in unmatched",
      "Cut cold launch by 23%",
    ],
  )
})

test("release notes drop repeats and stop at eight", () => {
  const subjects = Array.from({ length: 10 }, (_, index) => `fix(game): change ${index}`)
  assert.equal(releaseNotes([...subjects, "fix(game): change 0"]).length, 8)
})

const MINUTE = 60_000
const group = (commit, platform, minutesAgo, attempt = "") =>
  summarizeGroup([
    {
      id: `${commit}${attempt}-${platform}`,
      group: `g-${commit}${attempt}-${platform}`,
      platform,
      gitCommitHash: commit,
      message: `merge ${commit}`,
      createdAt: new Date(100 * MINUTE - minutesAgo * MINUTE).toISOString(),
    },
  ])

test("a release carries every platform's group for its commit", () => {
  const { candidate, soaking } = pickRelease(
    [
      group("new", "ios", 5),
      group("new", "android", 5),
      group("old", "ios", 70),
      group("old", "android", 71),
    ],
    100 * MINUTE,
    60 * MINUTE,
  )
  assert.deepEqual(candidate.groups, ["g-old-ios", "g-old-android"])
  assert.deepEqual(candidate.updateIds, ["old-ios", "old-android"])
  assert.equal(candidate.firstPublishedAt, 29 * MINUTE)
  assert.equal(candidate.lastPublishedAt, 30 * MINUTE)
  assert.deepEqual(
    soaking.map((release) => release.commit),
    ["new"],
  )
})

test("a release missing a platform is never promoted", () => {
  const { candidate } = pickRelease([group("old", "ios", 70)], 100 * MINUTE, 60 * MINUTE)
  assert.equal(candidate, null)
})

test("a release soaks from its last platform's publish", () => {
  const { candidate } = pickRelease(
    [group("old", "ios", 59), group("old", "android", 61)],
    100 * MINUTE,
    60 * MINUTE,
  )
  assert.equal(candidate, null)
})

test("a commit published twice promotes only its newest groups", () => {
  const groups = [
    group("same", "ios", 5, "-rerun"),
    group("same", "android", 5, "-rerun"),
    group("same", "ios", 70),
    group("same", "android", 70),
  ]
  assert.equal(pickRelease(groups, 100 * MINUTE, 60 * MINUTE).candidate, null)
  assert.deepEqual(pickRelease(groups, 100 * MINUTE, 0).candidate.groups, [
    "g-same-rerun-ios",
    "g-same-rerun-android",
  ])
})
