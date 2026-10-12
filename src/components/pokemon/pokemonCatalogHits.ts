import type { PokemonSearchHit } from "./usePokemonCatalog"

/** why: brief search results carry no set, but the TCGdex id is `<set>-<number>` ("sv08.5-028"), which reads as "SV8.5 028" once the set's leading zeros go. */
export function pokemonPrintingLabel(cardId: string): string | undefined {
  const split = cardId.lastIndexOf("-")
  if (split <= 0 || split === cardId.length - 1) return undefined
  const set = cardId.slice(0, split).toUpperCase()
  const number = cardId.slice(split + 1)
  return `${set.replace(/^([A-Z]+)0+(?=\d)/, "$1")} ${number}`
}

export function hitDetail(hit: PokemonSearchHit): string | undefined {
  return (
    pokemonPrintingLabel(hit.cardId) ??
    (hit.setCode
      ? `${hit.setCode.toUpperCase()} ${hit.collectorNumber ?? ""}`.trim()
      : undefined) ??
    (hit.collectorNumber ? `#${hit.collectorNumber}` : hit.typeLabel)
  )
}

function standardLegal(hit: PokemonSearchHit) {
  return hit.facets.some(({ key, value }) => key === "standardLegal" && value === "true")
}

/** why: the catalog returns every printing of a name; the rows people pick from are the ones legal now, and two rows that read the same are one choice. */
export function catalogRows(hits: readonly PokemonSearchHit[]): PokemonSearchHit[] {
  const seen = new Set<string>()
  return [...hits]
    .sort((a, b) => Number(standardLegal(b)) - Number(standardLegal(a)))
    .filter((hit) => {
      const row = `${hit.name}\n${hitDetail(hit) ?? ""}`
      if (seen.has(row)) return false
      seen.add(row)
      return true
    })
}
