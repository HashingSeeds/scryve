import { catalogRows, hitDetail, pokemonPrintingLabel } from "./pokemonCatalogHits"
import type { PokemonSearchHit } from "./usePokemonCatalog"

function hit(cardId: string, name = "Pikachu", facets: PokemonSearchHit["facets"] = []) {
  return { game: "pokemon", cardId, name, facets } as PokemonSearchHit
}

describe("pokemonPrintingLabel", () => {
  it("reads the set and number out of the TCGdex id", () => {
    expect(pokemonPrintingLabel("sv08.5-028")).toBe("SV8.5 028")
    expect(pokemonPrintingLabel("sv03-125")).toBe("SV3 125")
    expect(pokemonPrintingLabel("swsh9-018")).toBe("SWSH9 018")
    expect(pokemonPrintingLabel("xy0-1")).toBe("XY0 1")
    expect(pokemonPrintingLabel("tk-hs-r-2")).toBe("TK-HS-R 2")
    expect(pokemonPrintingLabel("basep-1")).toBe("BASEP 1")
  })

  it("gives up on an id with no number", () => {
    expect(pokemonPrintingLabel("promo")).toBeUndefined()
    expect(pokemonPrintingLabel("sv03-")).toBeUndefined()
  })
})

describe("catalogRows", () => {
  it("drops a row that would read the same as one already shown", () => {
    const rows = catalogRows([hit("sv03-125"), hit("sv03-125"), hit("sv03-125", "Charizard ex")])
    expect(rows.map((row) => `${row.name} ${hitDetail(row)}`)).toEqual([
      "Pikachu SV3 125",
      "Charizard ex SV3 125",
    ])
  })
})
