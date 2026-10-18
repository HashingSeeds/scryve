import { needsStoreUpdate } from "./storeUpdate"

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
