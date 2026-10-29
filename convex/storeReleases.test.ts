import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"

describe("store releases", () => {
  it("keeps one live release per platform", async () => {
    const t = makeConvexTest()
    await t.mutation(internal.storeReleases.setLive, {
      platform: "ios",
      version: "0.2.0",
      runtimeVersion: "runtime-a",
    })
    await t.mutation(internal.storeReleases.setLive, {
      platform: "ios",
      version: "0.3.0",
      runtimeVersion: "runtime-b",
    })

    await expect(t.query(api.storeReleases.live, { platform: "ios" })).resolves.toEqual({
      version: "0.3.0",
      runtimeVersion: "runtime-b",
    })
    await expect(t.query(api.storeReleases.live, { platform: "android" })).resolves.toBeNull()
  })
})
