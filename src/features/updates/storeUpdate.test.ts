import { renderHook } from "@testing-library/react-native"

import { needsStoreUpdate, STORE_PAGE, useStoreUpdate } from "./storeUpdate"

let mockLive: unknown
jest.mock("./appUpdate", () => ({ isStoreBuild: () => true }))
jest.mock("convex/react", () => ({ useQuery_experimental: () => mockLive }))
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.2.0" }))
jest.mock("expo-updates", () => ({ runtimeVersion: "runtime-a" }))
jest.mock("../../../modules/play-app-update", () => ({
  useDownloadedPlayVersion: () => null,
  startFlexibleUpdate: jest.fn(),
}))

const installed = { version: "0.2.0", runtimeVersion: "runtime-a" }

describe("needsStoreUpdate", () => {
  it("asks for the store once a newer binary moves to another runtime", () => {
    expect(needsStoreUpdate(installed, { version: "0.10.0", runtimeVersion: "runtime-b" })).toBe(
      true,
    )
  })

  it("leaves a newer version on the same runtime to OTA updates", () => {
    expect(needsStoreUpdate(installed, { version: "0.3.0", runtimeVersion: "runtime-a" })).toBe(
      false,
    )
  })

  it("stays quiet for builds ahead of the store and before anything is recorded", () => {
    expect(needsStoreUpdate(installed, { version: "0.1.2", runtimeVersion: "runtime-b" })).toBe(
      false,
    )
    expect(needsStoreUpdate(installed, null)).toBe(false)
    expect(needsStoreUpdate(installed, undefined)).toBe(false)
  })
})

describe("useStoreUpdate", () => {
  it("offers the store page when a newer binary is live", () => {
    mockLive = { status: "success", data: { version: "0.10.0", runtimeVersion: "runtime-b" } }
    expect(renderHook(() => useStoreUpdate()).result.current).toBe(STORE_PAGE)
  })

  it("offers nothing when the release check fails", () => {
    mockLive = { status: "error", error: new Error("Server Error") }
    expect(renderHook(() => useStoreUpdate()).result.current).toBeNull()
  })
})
