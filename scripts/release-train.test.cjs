const assert = require("node:assert/strict")
const { test } = require("node:test")

const { releaseNotes, summarizeGroup } = require("./release-train.cjs")

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

test("a beta group carries every platform's update id", () => {
  const update = {
    group: "g1",
    gitCommitHash: "abc",
    message: "fix",
    createdAt: "2026-10-08T10:00:00.000Z",
  }
  assert.deepEqual(
    summarizeGroup([
      { ...update, id: "ios" },
      { ...update, id: "android" },
    ]),
    {
      group: "g1",
      commit: "abc",
      message: "fix",
      publishedAt: Date.parse("2026-10-08T10:00:00.000Z"),
      updateIds: ["ios", "android"],
    },
  )
})
