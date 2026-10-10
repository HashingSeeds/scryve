import type { FunctionReturnType } from "convex/server"
import { convexTest } from "convex-test"

import { integration } from "./integrations"
import { api, internal } from "../_generated/api"
import schema from "../schema"

const modules = {
  "../_generated/api.ts": async () => jest.requireActual("../_generated/api"),
  "../_generated/server.ts": async () => jest.requireActual("../_generated/server"),
  "../integrationManifest.ts": async () => jest.requireActual("../integrationManifest"),
  "../lib/integrations.ts": async () => jest.requireActual("../lib/integrations"),
}

describe("integration capability state", () => {
  it("uses the official Pokémon spelling in user-facing integration metadata", async () => {
    expect(integration("pokemon")).toMatchObject({
      displayName: "Pokémon TCG",
      rights: {
        requiredNotices: [
          "Pokémon, card artwork, and related marks remain property of their respective owners.",
        ],
      },
    })
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
    const t = convexTest(schema, modules)

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
