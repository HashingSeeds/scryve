import { normalizeScryfallCard } from "./scryfall"

describe("normalizeScryfallCard", () => {
  it("keeps the top-level printing details", () => {
    expect(
      normalizeScryfallCard({
        id: "22222222-2222-2222-2222-222222222222",
        oracle_id: "11111111-1111-1111-1111-111111111111",
        name: "Llanowar Elves",
        mana_cost: "{G}",
        type_line: "Creature — Elf Druid",
        oracle_text: "{T}: Add {G}.",
        set_name: "Dominaria",
        set: "dom",
        collector_number: "168",
        rarity: "common",
        image_uris: {
          normal: "https://cards.scryfall.io/normal/elves.jpg",
          small: "https://cards.scryfall.io/small/elves.jpg",
        },
      }),
    ).toEqual({
      scryfallId: "22222222-2222-2222-2222-222222222222",
      oracleId: "11111111-1111-1111-1111-111111111111",
      name: "Llanowar Elves",
      imageUrl: "https://cards.scryfall.io/normal/elves.jpg",
      smallImageUrl: "https://cards.scryfall.io/small/elves.jpg",
      manaCost: "{G}",
      typeLine: "Creature — Elf Druid",
      oracleText: "{T}: Add {G}.",
      setName: "Dominaria",
      setCode: "dom",
      collectorNumber: "168",
      rarity: "common",
    })
  })

  it("joins face values when a double-faced card has no top-level text", () => {
    expect(
      normalizeScryfallCard({
        id: "33333333-3333-3333-3333-333333333333",
        name: "Delver of Secrets // Insectile Aberration",
        card_faces: [
          {
            mana_cost: "{U}",
            type_line: "Creature — Human Wizard",
            oracle_text: "At the beginning of your upkeep, look at the top card.",
            image_uris: {
              normal: "https://cards.scryfall.io/normal/delver.jpg",
              small: "https://cards.scryfall.io/small/delver.jpg",
            },
          },
          {
            mana_cost: "",
            type_line: "Creature — Human Insect",
            oracle_text: "Flying",
          },
        ],
      }),
    ).toMatchObject({
      oracleId: "33333333-3333-3333-3333-333333333333",
      imageUrl: "https://cards.scryfall.io/normal/delver.jpg",
      smallImageUrl: "https://cards.scryfall.io/small/delver.jpg",
      manaCost: "{U}",
      typeLine: "Creature — Human Wizard // Creature — Human Insect",
      oracleText: "At the beginning of your upkeep, look at the top card.\n—\nFlying",
    })
  })

  it("omits missing fields and rejects unusable payloads", () => {
    expect(
      normalizeScryfallCard({
        id: "44444444-4444-4444-4444-444444444444",
        name: "Plains",
      }),
    ).toEqual({
      scryfallId: "44444444-4444-4444-4444-444444444444",
      oracleId: "44444444-4444-4444-4444-444444444444",
      name: "Plains",
    })
    expect(normalizeScryfallCard({ name: "No Identifier" })).toBeNull()
    expect(normalizeScryfallCard(null)).toBeNull()
  })
})
