import type { Platform } from "react-native"

let mockSharingModule: object | null = null
const mockShareAsync = jest.fn(async () => undefined)

jest.mock("expo", () => ({ requireOptionalNativeModule: () => mockSharingModule }))
jest.mock("expo-sharing", () => ({ shareAsync: mockShareAsync }))
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: jest.fn().mockImplementation((_dir: string, name: string) => ({
    uri: `file:///cache/${name}`,
    write: jest.fn(async () => undefined),
  })),
}))

function loadShareImage(os: typeof Platform.OS, hasModule: boolean) {
  mockSharingModule = hasModule ? {} : null
  let loaded: typeof import("./shareImage") | undefined
  jest.isolateModules(() => {
    const reactNative = jest.requireActual<typeof import("react-native")>("react-native")
    reactNative.Platform.OS = os
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

  it("keeps the share button on an older iOS binary, which shares through React Native", () => {
    expect(loadShareImage("ios", false).canShareImage).toBe(true)
  })
})
