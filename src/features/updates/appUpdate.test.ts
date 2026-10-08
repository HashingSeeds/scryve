import { newReleaseNotes } from "./appUpdate"

const update = {
  releaseNotes: ["Match history", "Best of three", "Local games upload"],
  releaseNotesNewSince: { newest: 0, middle: 1, oldest: 2 },
}

describe("newReleaseNotes", () => {
  it("shows only the notes newer than the commit this install runs", () => {
    expect(newReleaseNotes(update, "middle")).toEqual(["Match history"])
    expect(newReleaseNotes(update, "newest")).toEqual([])
  })

  it("shows every note when the running commit is unknown or outside the window", () => {
    expect(newReleaseNotes(update, undefined)).toEqual(update.releaseNotes)
    expect(newReleaseNotes(update, "ancient")).toEqual(update.releaseNotes)
    expect(newReleaseNotes({ releaseNotes: ["Faster sync"] }, "middle")).toEqual(["Faster sync"])
  })
})
