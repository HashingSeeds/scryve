import { magicDatasetCard, magicLocalCard, magicTextIndex, textIndexCards } from "./magicDataset"

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
  it("keeps the text of both faces once, as search words without reminder text", () => {
    const result = magicDatasetCard({
      ...card,
      card_faces: [
        {
          ...card.card_faces[0],
          oracle_text: "Cycling {2} ({2}, Discard this card: Draw a card.)",
        },
        { ...card.card_faces[1], oracle_text: "This spell can't be countered." },
      ],
    })
    expect(result?.textKey).toBe("cycling 2 this spell cant be countered")
  })

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

  it("keeps mana value, front-face toughness, EDHREC rank, and the deck formats the card is legal in", () => {
    const result = magicDatasetCard({
      ...card,
      cmc: 1,
      edhrec_rank: 2104,
      card_faces: [
        { ...card.card_faces[0], toughness: "1" },
        { ...card.card_faces[1], toughness: "1" },
      ],
      legalities: {
        modern: "legal",
        vintage: "restricted",
        standard: "not_legal",
        oldschool: "legal",
      },
    })
    expect(result).toMatchObject({
      manaValue: 1,
      toughness: "1",
      edhrecRank: 2104,
      legalFormats: ["modern", "vintage"],
    })
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

describe("magicTextIndex", () => {
  it("lists the cards holding each word, and leaves a word in over 4000 cards unlisted", () => {
    const cards = [
      { textKey: "draw a card" },
      { textKey: "flying" },
      { textKey: "draw two cards" },
      ...Array.from({ length: 4001 }, () => ({ textKey: "flying" })),
    ].map((fields, index) => ({
      scryfallId: `${index}`,
      oracleId: `${index}`,
      name: `${index}`,
      ...fields,
    }))
    const index = magicTextIndex(cards)
    expect(textIndexCards(index.draw)).toEqual([0, 2])
    expect(textIndexCards(index.cards)).toEqual([2])
    expect(index.flying).toBe("")
  })
})

describe("magicLocalCard", () => {
  it("keeps the text of both faces that the deck file drops", () => {
    const local = magicLocalCard(card)
    expect(local?.oracleText).toContain("look at the top card")
    expect(local?.oracleText).toContain("Flying")
    expect(local?.faceDetails).toContain("Flying")
    expect(magicDatasetCard(card)?.faceDetails).not.toContain("Flying")
  })

  it("keeps a meld result, which no deck allows but players still look up", () => {
    const melded = { ...card, all_parts: [{ component: "meld_result", name: card.name }] }
    expect(magicLocalCard(melded)?.name).toBe(card.name)
    expect(magicDatasetCard(melded)).toBeNull()
  })
})
