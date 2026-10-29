import type { FunctionReturnType } from "convex/server"

import { integration } from "./integrations"
import { makeConvexTest } from "../../test/convexTest"
import { api, internal } from "../_generated/api"

describe("integration capability state", () => {
  it("keeps the Pokémon owners and non-affiliation in its required notice", () => {
    const [notice] = integration("pokemon")?.rights.requiredNotices ?? []
    for (const owner of ["Nintendo", "Creatures", "GAME FREAK", "The Pokémon Company"])
      expect(notice).toContain(owner)
    expect(notice).toMatch(/not affiliated with or endorsed by/)
  })

  it("lists integrations with their literal registry types", () => {
    type Listed = FunctionReturnType<typeof api.integrationManifest.list>[number]
    const accepts = <T>(value: T) => value
    expect(accepts<Listed["identityNamespace"]>("scryfall-oracle")).toBe("scryfall-oracle")
    // @ts-expect-error no system uses this namespace
    accepts<Listed["identityNamespace"]>("bogus")
    // @ts-expect-error every system ships functional card context images
    accepts<Listed["rights"]["imageUse"]>("none")
  })

  it("retains the registry note when an override has no note", async () => {
    const t = makeConvexTest()

    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "mtg",
      capability: "images",
      release: "disabled",
    })

    await expect(
      t.query(internal.integrationManifest.getCapabilityState, {
        game: "mtg",
        capability: "images",
      }),
    ).resolves.toMatchObject({
      release: "disabled",
      note: "Functional card context only.",
    })
  })
})
