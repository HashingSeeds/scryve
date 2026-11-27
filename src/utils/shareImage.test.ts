let mockSharingModule: object | null = null
const mockPlatform = { OS: "ios" }
const mockShare = jest.fn(async () => ({ action: "sharedAction" }))
const mockShareAsync = jest.fn(async () => undefined)

jest.mock("react-native", () => ({ Platform: mockPlatform, Share: { share: mockShare } }))
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

  it("shares the PNG through expo-sharing where the module exists", async () => {
    const { canShareImage, shareImage } = loadShareImage("android", true)

    await shareImage("aGk=", "recap.png")

    expect(canShareImage).toBe(true)
    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/recap.png", {
      mimeType: "image/png",
      UTI: "public.png",
    })
  })

  it("shares through React Native on an older iOS binary", async () => {
    const { canShareImage, shareImage } = loadShareImage("ios", false)

    await shareImage("aGk=", "recap.png")

    expect(canShareImage).toBe(true)
    expect(mockShare).toHaveBeenCalledWith({ url: "file:///cache/recap.png" })
  })
})
