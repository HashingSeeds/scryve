import { DECK_GAMES, preconstructedFormat, preconSearchFormat } from "./deckGames"

describe("deck game labels", () => {
  it("uses the official Pokémon spelling in user-facing labels", () => {
    expect(DECK_GAMES.pokemon.label).toBe("Pokémon TCG")
    expect(DECK_GAMES.pokemon.shortLabel).toBe("Pokémon")
  })
})

it.each([
  ["Challenger Deck", "standard"],
  ["Pioneer Challenger Deck", "pioneer"],
  ["Modern Event Deck", "modern"],
  ["Commander Deck", "commander"],
])("keeps %s lists in %s", (type, format) => {
  expect(preconstructedFormat(type)).toBe(format)
  expect(preconSearchFormat(format)).toBe(format)
})

it("keeps unsupported formats filtered instead of showing unrelated precons", () => {
  expect(preconSearchFormat("legacy")).toBe("legacy")
})
