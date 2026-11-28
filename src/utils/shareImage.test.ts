let mockSharingModule: object | null = null
const mockPlatform = { OS: "ios" }
const mockShare = jest.fn(async () => ({ action: "sharedAction" }))
const mockShareAsync = jest.fn(async () => undefined)

jest.mock("react-native", () => ({
  Platform: mockPlatform,
  Share: { share: mockShare, sharedAction: "sharedAction", dismissedAction: "dismissedAction" },
}))
jest.mock("expo", () => ({ requireOptionalNativeModule: () => mockSharingModule }))
jest.mock("expo-sharing", () => {
  if (!mockSharingModule) throw new Error("Cannot find native module 'ExpoSharing'")
  return { shareAsync: mockShareAsync }
})
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: jest.fn().mockImplementation((_dir: string, name: string) => ({
    uri: `file:///cache/${name}`,
    write: jest.fn(async () => undefined),
  })),
}))

function loadShareImage(os: "ios" | "android", hasModule: boolean) {
  mockPlatform.OS = os
  mockSharingModule = hasModule ? {} : null
  let loaded: typeof import("./shareImage") | undefined
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import("./shareImage")>("./shareImage")
  })
  if (!loaded) throw new Error("shareImage did not load")
  return loaded
}

afterEach(() => jest.clearAllMocks())

describe("shareImage", () => {
  it("keeps the share button hidden on an Android binary built without expo-sharing", () => {
    expect(loadShareImage("android", false).canShareImage).toBe(false)
  })

  it("shares the PNG through expo-sharing on Android, which does not report the outcome", async () => {
    const { canShareImage, shareImage } = loadShareImage("android", true)

    await expect(shareImage("aGk=", "recap.png", "Bea won at 3 life.")).resolves.toBe("unreported")

    expect(canShareImage).toBe(true)
    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/recap.png", {
      mimeType: "image/png",
    })
  })

  it("sends the caption with the PNG on iOS and reports whether it was shared", async () => {
    const { canShareImage, shareImage } = loadShareImage("ios", true)

    await expect(shareImage("aGk=", "recap.png", "Bea won at 3 life.")).resolves.toBe("shared")
    mockShare.mockResolvedValueOnce({ action: "dismissedAction" })
    await expect(shareImage("aGk=", "recap.png", "Bea won at 3 life.")).resolves.toBe("dismissed")

    expect(canShareImage).toBe(true)
    expect(mockShare).toHaveBeenCalledWith({
      url: "file:///cache/recap.png",
      message: "Bea won at 3 life.",
    })
    expect(mockShareAsync).not.toHaveBeenCalled()
  })
})
