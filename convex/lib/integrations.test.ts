import { convexTest } from "convex-test"

import { integration } from "./integrations"
import { internal } from "../_generated/api"
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
