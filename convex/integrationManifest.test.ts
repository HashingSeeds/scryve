import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import { isReleased } from "./lib/systems"

describe("integrationManifest.list", () => {
  it.each(["exampleDecks", "rules"] as const)(
    "reports a %s override so the app hides what the server switched off",
    async (capability) => {
      const t = makeConvexTest()
      const released = async () => {
        const mtg = (await t.query(api.integrationManifest.list, {})).find(({ id }) => id === "mtg")
        return mtg && isReleased(mtg.capabilities.integration, mtg.capabilities[capability])
      }

      expect(await released()).toBe(true)
      await t.mutation(internal.integrationManifest.setCapabilityOverride, {
        game: "mtg",
        capability,
        release: "disabled",
      })
      expect(await released()).toBe(false)
    },
  )
})
