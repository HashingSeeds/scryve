import { DECK_GAMES } from "./deckGames"

describe("deck game labels", () => {
  it("uses the official Pokémon spelling in user-facing labels", () => {
    expect(DECK_GAMES.pokemon.label).toBe("Pokémon TCG")
    expect(DECK_GAMES.pokemon.shortLabel).toBe("Pokémon")
  })
})
