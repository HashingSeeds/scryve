import { normalizeLimitlessStandings, pokemonSummaryLookupKey } from "./limitless"

describe("Limitless Pokemon deck normalization", () => {
  it("flattens Pokemon, Trainer, and Energy groups while retaining category", () => {
    const result = normalizeLimitlessStandings(
      {
        id: "tournament-1",
        name: "Weekly",
        format: "STANDARD",
        date: "2026-08-28T00:00:00.000Z",
      },
      [
        {
          player: "player-1",
          placing: 1,
          deck: { name: "Crustle" },
          decklist: {
            pokemon: [{ count: 20, set: "DRI", number: "12", name: "Crustle" }],
            trainer: [{ count: 30, set: "SVI", number: "186", name: "Pokegear 3.0" }],
            energy: [{ count: 10, set: "TEF", number: "161", name: "Mist Energy" }],
          },
        },
      ],
    )

    expect(result[0]).toMatchObject({
      externalId: "tournament-1:player-1",
      name: "Crustle",
      format: "standard",
    })
    expect(result[0]?.entries.map((entry) => entry.category)).toEqual([
      "pokemon",
      "trainer",
      "energy",
    ])
    expect(pokemonSummaryLookupKey("Pokegear 3.0", "0186")).toBe("pokegear 3.0:186")
  })

  it("links each deck to its own Limitless decklist page", () => {
    const decklist = {
      pokemon: [{ count: 60, set: "DRI", number: "12", name: "Crustle" }],
    }
    const result = normalizeLimitlessStandings({ id: "t1", name: "Weekly" }, [
      { player: "a b/c", placing: 2, decklist },
    ])

    expect(result[0]?.sourceUrl).toBe(
      "https://play.limitlesstcg.com/tournament/t1/player/a%20b%2Fc/decklist",
    )
  })

  it("drops standings without a structurally valid deck list", () => {
    expect(normalizeLimitlessStandings({ id: "t", name: "T" }, [{ player: "p" }])).toEqual([])
  })
})
