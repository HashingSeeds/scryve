import type { MineDeck } from "@/features/decks/decksSync"

import { nearbyDeckState, nearbySeatDeck } from "./nearbyDecks"

const hero = {
  _id: "deck-dorinthea",
  name: "Dorinthea",
  game: "fab",
  format: "cc",
  latestVersionId: "version-2",
  startingValue: 20,
  versions: [{ _id: "version-1" }, { _id: "version-2" }],
} as Partial<MineDeck> as MineDeck
const fab = { system: "fab", format: "cc" } as const

describe("nearby deck choices", () => {
  it("offers only a hero deck's latest version, the one whose health this device knows", () => {
    const state = nearbyDeckState([hero], true, fab)
    const magic = nearbyDeckState([hero], true, { system: "mtg", format: "commander" })

    expect(state.status === "ready" && state.value[0]?.versions).toEqual([{ _id: "version-2" }])
    expect(magic.status === "ready" && magic.value[0]?.versions).toHaveLength(2)
  })

  it("takes a deck only for the lobby's game and format", () => {
    expect(nearbySeatDeck([hero], "version-2", fab)).toEqual({
      versionId: "version-2",
      name: "Dorinthea",
      startingValue: 20,
    })
    expect(nearbySeatDeck([hero], "version-2", { system: "mtg", format: "commander" })).toBe(
      undefined,
    )
  })
})
