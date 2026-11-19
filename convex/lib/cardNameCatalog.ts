import { ConvexError } from "convex/values"

import { objectRecord, SCRYFALL_BASE_URL } from "./scryfall"

const MAX_CARD_NAMES_BYTES = 900_000
const MAX_ALTERNATE_NAME_PAGES = 10

type ScryfallJson = (path: string) => Promise<ReturnType<typeof objectRecord>>

export const isCatalogName = (name: unknown): name is string =>
  typeof name === "string" && name.trim().length > 0 && name.length <= 200 && !/[\r\n\t]/.test(name)

function invalidCatalog(): never {
  throw new ConvexError({
    code: "scryfall_invalid_response",
    message: "Invalid card names response",
  })
}

async function fetchCardNames(scryfallJson: ScryfallJson) {
  const payload = await scryfallJson("/catalog/card-names")
  const data = payload?.data
  if (payload?.object !== "catalog" || !Array.isArray(data) || !data.length) invalidCatalog()
  if (!data.every(isCatalogName)) invalidCatalog()
  const names = data.join("\n")
  if (names.length > MAX_CARD_NAMES_BYTES) invalidCatalog()
  return names
}

async function fetchPrintedToRulesNameLines(scryfallJson: ScryfallJson) {
  const pairs = new Set<string>()
  let path = "/cards/search?q=has%3Aflavorname&unique=prints"
  for (let page = 0; page < MAX_ALTERNATE_NAME_PAGES; page++) {
    const payload = await scryfallJson(path)
    const cards = Array.isArray(payload?.data) ? payload.data : invalidCatalog()
    for (const value of cards) {
      const card = objectRecord(value)
      const faces = Array.isArray(card?.card_faces) ? card.card_faces.map(objectRecord) : []
      for (const entry of [card, ...faces]) {
        const printed = entry?.flavor_name
        if (isCatalogName(printed) && isCatalogName(card?.name))
          pairs.add(`${printed}\t${card.name}`)
      }
    }
    if (payload?.has_more !== true) return [...pairs].join("\n")
    const next = payload.next_page
    if (typeof next !== "string" || !next.startsWith(`${SCRYFALL_BASE_URL}/`)) invalidCatalog()
    path = next.slice(SCRYFALL_BASE_URL.length)
  }
  return invalidCatalog()
}

/** why: the name search index is built from this catalog, so the server and the search eval read Scryfall the same way. */
export async function fetchCardNameCatalog(scryfallJson: ScryfallJson) {
  return {
    names: await fetchCardNames(scryfallJson),
    alternateNames: await fetchPrintedToRulesNameLines(scryfallJson),
  }
}
