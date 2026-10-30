import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import { isReleased } from "./lib/systems"

describe("integrationManifest.list", () => {
  it("reports an override so the app hides what the server switched off", async () => {
    const t = makeConvexTest()
    const exampleDecksReleased = async () => {
      const mtg = (await t.query(api.integrationManifest.list, {})).find(({ id }) => id === "mtg")
      return mtg && isReleased(mtg.capabilities.integration, mtg.capabilities.exampleDecks)
    }

    expect(await exampleDecksReleased()).toBe(true)
    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "mtg",
      capability: "exampleDecks",
      release: "disabled",
    })
    expect(await exampleDecksReleased()).toBe(false)
  })
})
