import {
  compact,
  facet,
  normalizeCardName,
  objectRecord,
  stringValue,
  type NormalizedCard,
} from "./cards"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"

const BASE_URL = "https://api.tcgdex.net/v2/en"
const REQUEST_INTERVAL_MS = 100
const REQUEST_TIMEOUT_MS = 10_000
const CATALOG_REFERENCES_PER_REQUEST = 10
const MAX_CATALOG_REFERENCES = 120
const MAX_CATALOG_RESULTS_PER_REQUEST = 500

function textBlock(value: unknown) {
  const item = objectRecord(value)
  if (!item) return undefined
  const name = stringValue(item.name)
  const effect = stringValue(item.effect)
  const damage =
    typeof item.damage === "number" || typeof item.damage === "string"
      ? String(item.damage)
      : undefined
  const heading = [name, damage].filter(Boolean).join(" · ")
  return [heading, effect].filter(Boolean).join("\n") || undefined
}

function pokemonCardText(card: Record<string, unknown>) {
  const abilities = Array.isArray(card.abilities) ? card.abilities.map(textBlock) : []
  const attacks = Array.isArray(card.attacks) ? card.attacks.map(textBlock) : []
  const rules = Array.isArray(card.rules)
    ? card.rules.filter((rule): rule is string => typeof rule === "string")
    : []
  return compact([stringValue(card.effect), ...abilities, ...attacks, ...rules]).join("\n\n")
}

function normalizePokemonCard(value: unknown, includeImages: boolean): NormalizedCard | null {
  const card = objectRecord(value)
  if (!card) return null
  const id = stringValue(card.id)
  const name = stringValue(card.name)
  if (!id || !name) return null
  const set = objectRecord(card.set)
  const types = Array.isArray(card.types)
    ? card.types.filter((item): item is string => typeof item === "string")
    : []
  const legal = objectRecord(card.legal)
  const imageBase = stringValue(card.image)
  const text = pokemonCardText(card)
  const typeLabel = compact([
    stringValue(card.category),
    stringValue(card.stage),
    stringValue(card.trainerType),
    stringValue(card.energyType),
    types.join("/"),
  ]).join(" · ")
  return {
    game: "pokemon",
    identityNamespace: "tcgdex-card",
    cardId: id,
    name,
    nameNormalized: normalizeCardName(name),
    ...(stringValue(card.category) ? { category: stringValue(card.category) } : {}),
    facets: compact([
      facet("stage", card.stage),
      facet("types", types.join(", ")),
      facet(
        "standardLegal",
        typeof legal?.standard === "boolean" ? String(legal.standard) : undefined,
      ),
      facet(
        "expandedLegal",
        typeof legal?.expanded === "boolean" ? String(legal.expanded) : undefined,
      ),
    ]),
    printings: [
      {
        provider: "tcgdex",
        providerCardId: id,
        printingId: id,
        ...(stringValue(set?.id) ? { setCode: stringValue(set?.id) } : {}),
        ...(stringValue(card.localId) ? { collectorNumber: stringValue(card.localId) } : {}),
        ...(stringValue(card.rarity) ? { rarity: stringValue(card.rarity) } : {}),
        ...(typeLabel ? { typeLabel } : {}),
        faces: [
          {
            index: 0,
            name,
            ...(text ? { text } : {}),
            ...(imageBase && includeImages
              ? {
                  imageUrl: `${imageBase}/high.webp`,
                  smallImageUrl: `${imageBase}/low.webp`,
                }
              : {}),
          },
        ],
      },
    ],
  }
}

export function normalizePokemonCards(value: unknown, includeImages = true): NormalizedCard[] {
  const candidates = Array.isArray(value) ? value : [value]
  return candidates.flatMap((candidate) => {
    const card = normalizePokemonCard(candidate, includeImages)
    return card ? [card] : []
  })
}

async function request(ctx: ActionCtx, path: string) {
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
    bucket: "tcgdex:cards",
    intervalMs: REQUEST_INTERVAL_MS,
  })
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  return await fetch(`${BASE_URL}${path}`, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

export async function searchPokemon(ctx: ActionCtx, query: string, includeImages = true) {
  const response = await request(ctx, `/cards?name=${encodeURIComponent(query)}`)
  if (!response.ok) throw Object.assign(new Error("TCGdex search failed"), { response })
  const summaries = normalizePokemonCards((await response.json()) as unknown, includeImages).slice(
    0,
    20,
  )
  return { cards: summaries, status: response.status }
}

export async function pokemonCardById(ctx: ActionCtx, id: string, includeImages = true) {
  const response = await request(ctx, `/cards/${encodeURIComponent(id)}`)
  if (response.status === 404) return { cards: [], status: response.status }
  if (!response.ok) throw Object.assign(new Error("TCGdex lookup failed"), { response })
  return {
    cards: normalizePokemonCards((await response.json()) as unknown, includeImages),
    status: response.status,
  }
}

function normalizedCollectorNumber(value: string) {
  return value.replace(/^0+/, "").toLocaleLowerCase()
}

function parsedReference(reference: string) {
  const match = reference.trim().match(/^([A-Za-z0-9-]+)\s+([A-Za-z0-9-]+)$/)
  return match ? { setCode: match[1].toUpperCase(), collectorNumber: match[2] } : undefined
}

function providerSetId(card: NormalizedCard, collectorNumber: string) {
  const suffix = `-${collectorNumber}`
  return card.cardId.endsWith(suffix) ? card.cardId.slice(0, -suffix.length) : undefined
}

async function matchesSetCode(ctx: ActionCtx, card: NormalizedCard, setCode: string) {
  const collectorNumber = card.printings[0]?.collectorNumber
  if (!collectorNumber) return false
  const setId = providerSetId(card, collectorNumber)
  if (!setId) return false
  const response = await request(ctx, `/sets/${encodeURIComponent(setId)}`)
  if (!response.ok) return false
  const set = objectRecord((await response.json()) as unknown)
  const abbreviations = objectRecord(set?.abbreviations)
  const officialCode = stringValue(set?.tcgOnline) ?? stringValue(abbreviations?.official)
  return officialCode?.toUpperCase() === setCode
}

export async function pokemonCardByReference(
  ctx: ActionCtx,
  name: string,
  originalReference: string,
  includeImages = true,
) {
  const reference = parsedReference(originalReference)
  if (!reference) return { cards: [], status: 404 }
  const response = await request(
    ctx,
    `/cards?name=${encodeURIComponent(name)}&localId=${encodeURIComponent(reference.collectorNumber)}`,
  )
  if (!response.ok) throw Object.assign(new Error("TCGdex reference lookup failed"), { response })
  const exact = normalizePokemonCards((await response.json()) as unknown, includeImages).filter(
    (card) =>
      normalizeCardName(card.name) === normalizeCardName(name) &&
      card.printings.some(
        (printing) =>
          printing.collectorNumber !== undefined &&
          normalizedCollectorNumber(printing.collectorNumber) ===
            normalizedCollectorNumber(reference.collectorNumber),
      ),
  )
  let selected = exact.length === 1 ? exact[0] : undefined
  if (!selected && exact.length > 1) {
    for (const candidate of exact.slice(0, 10)) {
      if (await matchesSetCode(ctx, candidate, reference.setCode)) {
        selected = candidate
        break
      }
    }
  }
  if (!selected) return { cards: [], status: response.status }
  return await pokemonCardById(ctx, selected.cardId, includeImages)
}

export async function pokemonCardSummaries(
  ctx: ActionCtx,
  references: readonly { name: string; collectorNumber: string }[],
  includeImages = true,
) {
  const uniqueReferences = [
    ...new Map(
      references.flatMap((reference) => {
        const name = reference.name.trim()
        const collectorNumber = reference.collectorNumber.trim()
        const key = `${normalizeCardName(name)}:${normalizedCollectorNumber(collectorNumber)}`
        return name && collectorNumber ? [[key, { name, collectorNumber }] as const] : []
      }),
    ).values(),
  ].slice(0, MAX_CATALOG_REFERENCES)
  const cards: NormalizedCard[] = []
  let status = 200
  for (let offset = 0; offset < uniqueReferences.length; offset += CATALOG_REFERENCES_PER_REQUEST) {
    const batch = uniqueReferences.slice(offset, offset + CATALOG_REFERENCES_PER_REQUEST)
    const query = new URLSearchParams({
      "name": `eq:${[...new Set(batch.map((reference) => reference.name))].join("|")}`,
      "localId": `eq:${[...new Set(batch.map((reference) => reference.collectorNumber))].join(
        "|",
      )}`,
      "pagination:page": "1",
      "pagination:itemsPerPage": String(MAX_CATALOG_RESULTS_PER_REQUEST),
    })
    const response = await request(ctx, `/cards?${query}`)
    if (!response.ok) throw Object.assign(new Error("TCGdex card list failed"), { response })
    cards.push(...normalizePokemonCards((await response.json()) as unknown, includeImages))
    status = response.status
  }
  return { cards, status }
}
