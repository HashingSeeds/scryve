import { magicDatasetCard } from "./magicDataset"

const card = {
  id: "22222222-2222-2222-2222-222222222222",
  oracle_id: "11111111-1111-1111-1111-111111111111",
  name: "Delver of Secrets // Insectile Aberration",
  layout: "transform",
  set_type: "expansion",
  type_line: "Creature — Human Wizard // Creature — Human Insect",
  card_faces: [
    {
      name: "Delver of Secrets",
      type_line: "Creature — Human Wizard",
      oracle_text: "At the beginning of your upkeep, look at the top card of your library.",
      image_uris: { normal: "https://cards.scryfall.io/normal/front/delver.jpg?1" },
    },
    {
      name: "Insectile Aberration",
      oracle_text: "Flying",
      image_uris: { normal: "https://cards.scryfall.io/normal/back/delver.jpg?1" },
    },
  ],
}

describe("magicDatasetCard", () => {
  it("drops every copy of the oracle text and the commander rules timestamp", () => {
    const result = magicDatasetCard(card)
    expect(result).not.toHaveProperty("oracleText")
    expect(result).not.toHaveProperty("commanderRulesUpdatedAt")
    expect(result?.commanderEligibility).toBe("ineligible")
    expect(JSON.parse(result?.faceDetails ?? "null")).toEqual([
      {
        name: "Delver of Secrets",
        imageUrl: "https://cards.scryfall.io/normal/front/delver.jpg?1",
        typeLine: "Creature — Human Wizard",
      },
      {
        name: "Insectile Aberration",
        imageUrl: "https://cards.scryfall.io/normal/back/delver.jpg?1",
      },
    ])
  })

  it.each([
    { layout: "token" },
    { layout: "double_faced_token" },
    { layout: "emblem" },
    { layout: "art_series" },
    { layout: "vanguard" },
    { layout: "scheme" },
    { layout: "planar" },
    { set_type: "memorabilia" },
  ])("skips objects that never go in a deck: %o", (override) => {
    expect(magicDatasetCard({ ...card, ...override })).toBeNull()
  })

  it.each([
    { set_type: "funny" },
    { border_color: "silver" },
    { security_stamp: "acorn" },
    { promo_types: ["playtest"] },
    { digital: true, legalities: { alchemy: "legal", commander: "not_legal" } },
    { all_parts: [{ component: "meld_result", name: card.name }] },
  ])("skips joke, playtest, digital and meld result cards no paper deck allows: %o", (override) => {
    expect(magicDatasetCard({ ...card, ...override })).toBeNull()
  })

  it.each([
    { digital: true, legalities: { vintage: "legal" } },
    { set_type: "funny", legalities: { commander: "legal" } },
    { legalities: { standard: "not_legal", commander: "not_legal" } },
    { all_parts: [{ component: "meld_part", name: card.name }] },
  ])("keeps real cards, including ones not yet legal: %o", (override) => {
    expect(magicDatasetCard({ ...card, ...override })).not.toBeNull()
  })
})
