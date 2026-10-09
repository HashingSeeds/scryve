import * as Updates from "expo-updates"

import { newReleaseNotes, openPrPreview } from "./appUpdate"

const mockUpdates = { channel: "preview", available: false }
jest.mock("expo-updates", () => ({
  __esModule: true,
  setUpdateRequestHeadersOverride: jest.fn(),
  checkForUpdateAsync: jest.fn(() => Promise.resolve({ isAvailable: mockUpdates.available })),
  fetchUpdateAsync: jest.fn(() => Promise.resolve()),
  reloadAsync: jest.fn(() => Promise.resolve()),
  get channel() {
    return mockUpdates.channel
  },
}))

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

describe("openPrPreview", () => {
  const override = jest.mocked(Updates.setUpdateRequestHeadersOverride)
  beforeEach(() => {
    override.mockClear()
    jest.mocked(Updates.reloadAsync).mockClear()
  })

  it("reloads into the PR channel when it has an update for this build", async () => {
    mockUpdates.available = true
    await expect(openPrPreview("pr-12")).resolves.toBe("reloading")
    expect(override).toHaveBeenLastCalledWith({ "expo-channel-name": "pr-12" })
    expect(Updates.reloadAsync).toHaveBeenCalled()
  })

  it("keeps the running PR channel when the new one has nothing this build can run", async () => {
    mockUpdates.channel = "pr-3"
    mockUpdates.available = false
    await expect(openPrPreview("pr-12")).resolves.toBe("missing")
    expect(override).toHaveBeenLastCalledWith({ "expo-channel-name": "pr-3" })
    expect(Updates.reloadAsync).not.toHaveBeenCalled()
  })

  it("never overrides the channel for anything but a PR channel", async () => {
    await expect(openPrPreview("production")).resolves.toBe("missing")
    expect(override).not.toHaveBeenCalled()
  })
})
