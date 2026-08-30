import { resourceCache as nativeResourceCache } from "./resourceCache.native"
import { resourceCache as webResourceCache } from "./resourceCache.web"

jest.mock("@clerk/expo/resource-cache", () => ({ resourceCache: "native-resource-cache" }))

describe("Clerk resource cache platform adapters", () => {
  it("uses Clerk's SecureStore-backed cache on native", () => {
    expect(nativeResourceCache).toBe("native-resource-cache")
  })

  it("does not initialize a resource cache on web", () => {
    expect(webResourceCache).toBeUndefined()
  })
})
