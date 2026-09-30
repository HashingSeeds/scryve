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
      commanderEligibility: "ineligible",
      commanderRulesUpdatedAt: expect.any(String),
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

describe("Commander eligibility", () => {
  const base = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Candidate",
    color_identity: ["G", "U"],
    legalities: { commander: "legal" },
  }

  it.each([
    [{ type_line: "Legendary Creature — Human" }, "eligible"],
    [{ type_line: "Creature — Human" }, "ineligible"],
    [{ type_line: "Legendary Planeswalker — Jace" }, "ineligible"],
    [
      {
        type_line: "Legendary Planeswalker — Teferi",
        oracle_text: "Teferi can be your commander.",
      },
      "eligible",
    ],
    [{ type_line: "Legendary Artifact — Vehicle", power: "7", toughness: "5" }, "eligible"],
    [{ type_line: "Legendary Artifact — Spacecraft", power: "*", toughness: "8" }, "eligible"],
    [{ type_line: "Legendary Artifact — Vehicle" }, "eligible"],
    [{ type_line: "Legendary Artifact — Spacecraft" }, "ineligible"],
    [{ type_line: "Legendary Artifact — Equipment", power: "7", toughness: "5" }, "ineligible"],
    [{ type_line: "Artifact — Vehicle", power: "7", toughness: "5" }, "ineligible"],
    [{ type_line: "Legendary Enchantment — Background" }, "ineligible"],
    [{ name: "Grist, the Hunger Tide", type_line: "Legendary Planeswalker — Grist" }, "eligible"],
    [
      {
        type_line: "Legendary Creature — Shapeshifter",
        oracle_text:
          "If The Prismatic Piper is your commander, choose a color before the game begins.",
      },
      "color-choice",
    ],
    [
      { card_faces: [{ type_line: "Sorcery" }, { type_line: "Legendary Creature — God" }] },
      "ineligible",
    ],
    [
      { card_faces: [{ type_line: "Legendary Creature — God" }, { type_line: "Artifact" }] },
      "eligible",
    ],
  ])("normalizes %j as %s", (fields, expected) => {
    expect(normalizeScryfallCard({ ...base, ...fields })).toMatchObject({
      commanderEligibility: expected,
      commanderLegality: "legal",
      colorIdentity: "UG",
    })
  })

  it("keeps legality separate from eligibility and preserves colorless identity", () => {
    expect(
      normalizeScryfallCard({
        ...base,
        type_line: "Legendary Creature — Human",
        color_identity: [],
        legalities: { commander: "banned" },
      }),
    ).toMatchObject({
      commanderEligibility: "eligible",
      commanderLegality: "banned",
      colorIdentity: "",
    })
    expect(normalizeScryfallCard({ ...base, color_identity: ["purple"] })).not.toHaveProperty(
      "colorIdentity",
    )
    expect(normalizeScryfallCard(base)).not.toHaveProperty("commanderEligibility")
  })
})

describe("card keywords", () => {
  const card = { id: "test", name: "Candidate" }

  it("preserves the provider keywords as scalar metadata, including known empty lists", () => {
    expect(normalizeScryfallCard({ ...card, keywords: ["Flying", "Ward"] })).toMatchObject({
      keywords: "Flying\nWard",
    })
    expect(normalizeScryfallCard({ ...card, keywords: [] })).toMatchObject({ keywords: "" })
    expect(normalizeScryfallCard(card)).not.toHaveProperty("keywords")
  })

  it.each([
    { keywords: [123] },
    { keywords: ["Flying\nWard"] },
    { keywords: Array(257).fill("Flying") },
  ])("omits invalid keyword arrays %j", ({ keywords }) =>
    expect(normalizeScryfallCard({ ...card, keywords })).not.toHaveProperty("keywords"),
  )
})
