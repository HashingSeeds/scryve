import {
  compact,
  facet,
  finiteNumber,
  hasJapaneseScript,
  normalizeCardName,
  objectRecord,
  rankByName,
  stringValue,
  type CardCatalog,
  type NormalizedCard,
} from "./cards"
import type { SectionCard } from "./decks"
import rushCards from "./rushCards.json"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"
import { env } from "../../_generated/server"

const BASE_URL = "https://db.ygoprodeck.com/api/v7"
const DEFAULT_IMAGE_BASE_URL = "https://ygo-images.scryve.sow.care"
const REQUEST_INTERVAL_MS = 100
const REQUEST_TIMEOUT_MS = 10_000
const SEARCH_RESULTS = 20
const JAPANESE_CANDIDATES = 50

function records(value: unknown) {
  const envelope = objectRecord(value)
  return Array.isArray(envelope?.data) ? envelope.data : []
}

function mirroredImageUrl(baseUrl: string | undefined, printingId: string) {
  if (!baseUrl) return undefined
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined
    return `${baseUrl.replace(/\/$/, "")}/images/yugioh/cards/${encodeURIComponent(printingId)}.jpg`
  } catch {
    return undefined
  }
}

export function ygoImageUrl(...ids: (string | undefined)[]) {
  const printingId = ids.find((id) => id !== undefined && /^\d+$/.test(id))
  if (!printingId) return undefined
  return mirroredImageUrl(configuredYgoImageBaseUrl(), printingId)
}

function configuredYgoImageBaseUrl() {
  return env.YGO_IMAGE_BASE_URL ?? DEFAULT_IMAGE_BASE_URL
}

export function normalizeYgoCards(value: unknown, imageBaseUrl?: string): NormalizedCard[] {
  return records(value).flatMap((candidate) => {
    const card = objectRecord(candidate)
    const cardNumber = finiteNumber(card?.id)
    const name = stringValue(card?.name)
    if (cardNumber === undefined || !name) return []
    const providerCardId = String(cardNumber)
    const rawImages = Array.isArray(card?.card_images) ? card.card_images : []
    const printingIds = rawImages.flatMap((candidateImage, index) => {
      const image = objectRecord(candidateImage)
      return [String(finiteNumber(image?.id) ?? `${providerCardId}:${index}`)]
    })
    const uniquePrintingIds = [...new Set(printingIds.length > 0 ? printingIds : [providerCardId])]
    const typeLabel = stringValue(card?.humanReadableCardType) ?? stringValue(card?.type)
    const text = stringValue(card?.desc)
      ?.replace(/<[^>]*>/g, "")
      .trim()
    return [
      {
        game: "ygo",
        identityNamespace: "ygoprodeck-card",
        cardId: providerCardId,
        name,
        nameNormalized: normalizeCardName(name),
        ...(stringValue(card?.type) ? { category: stringValue(card?.type) } : {}),
        facets: compact([
          facet("frameType", card?.frameType),
          facet("attribute", card?.attribute),
          facet("level", card?.level),
          facet("attack", card?.atk),
          facet("defense", card?.def),
          facet("archetype", card?.archetype),
        ]),
        printings: uniquePrintingIds.map((printingId) => {
          const imageUrl = mirroredImageUrl(imageBaseUrl, printingId)
          return {
            provider: "ygoprodeck",
            providerCardId,
            printingId,
            ...(typeLabel ? { typeLabel } : {}),
            faces: [
              {
                index: 0,
                name,
                ...(text ? { text } : {}),
                ...(imageUrl ? { imageUrl, smallImageUrl: imageUrl } : {}),
              },
            ],
          }
        }),
      },
    ]
  })
}

async function request(ctx: ActionCtx, path: string) {
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
    bucket: "ygoprodeck:cards",
    intervalMs: REQUEST_INTERVAL_MS,
  })
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  return await fetch(`${BASE_URL}${path}`, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

async function japaneseCandidates(ctx: ActionCtx, query: string) {
  const separatorFree = [...query.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "")].join("%")
  for (const fname of new Set([query, separatorFree])) {
    const response = await request(
      ctx,
      `/cardinfo.php?fname=${encodeURIComponent(fname)}&language=ja&num=${JAPANESE_CANDIDATES}&offset=0`,
    )
    if (response.status === 400) continue
    if (!response.ok) throw Object.assign(new Error("YGOPRODeck search failed"), { response })
    return normalizeYgoCards((await response.json()) as unknown)
  }
  return []
}

async function searchYgoJapanese(ctx: ActionCtx, query: string, includeImages: boolean) {
  const ids = rankByName(await japaneseCandidates(ctx, query), query, (card) => card.name)
    .slice(0, SEARCH_RESULTS)
    .map((card) => card.cardId)
  const english = await cardsByYgoIds(ctx, ids, includeImages)
  const order = new Map(ids.map((id, index) => [id, index]))
  return {
    cards: english.cards.sort(
      (a, b) => (order.get(a.cardId) ?? ids.length) - (order.get(b.cardId) ?? ids.length),
    ),
    status: english.status,
  }
}

export async function searchYgo(ctx: ActionCtx, query: string, includeImages = true) {
  if (hasJapaneseScript(query)) return await searchYgoJapanese(ctx, query, includeImages)
  const response = await request(
    ctx,
    `/cardinfo.php?fname=${encodeURIComponent(query)}&num=${SEARCH_RESULTS}&offset=0`,
  )
  if (response.status === 400) return { cards: [], status: response.status }
  if (!response.ok) throw Object.assign(new Error("YGOPRODeck search failed"), { response })
  return {
    cards: normalizeYgoCards(
      (await response.json()) as unknown,
      includeImages ? configuredYgoImageBaseUrl() : undefined,
    ),
    status: response.status,
  }
}

export async function cardsByYgoIds(ctx: ActionCtx, ids: readonly string[], includeImages = true) {
  if (ids.length === 0) return { cards: [], status: 200 }
  const response = await request(ctx, `/cardinfo.php?id=${encodeURIComponent(ids.join(","))}`)
  if (!response.ok) throw Object.assign(new Error("YGOPRODeck lookup failed"), { response })
  return {
    cards: normalizeYgoCards(
      (await response.json()) as unknown,
      includeImages ? configuredYgoImageBaseUrl() : undefined,
    ),
    status: response.status,
  }
}

export function ygoSection(card: SectionCard) {
  const frameType = card.facets.find((item) => item.key === "frameType")?.value
  return [
    "fusion",
    "fusion_pendulum",
    "synchro",
    "synchro_pendulum",
    "xyz",
    "xyz_pendulum",
    "link",
  ].includes(frameType ?? "")
    ? "extra"
    : "main"
}

export async function cardsByYgoIdBatches(
  ctx: ActionCtx,
  ids: readonly string[],
  includeImages: boolean,
) {
  const cards: NormalizedCard[] = []
  for (let offset = 0; offset < ids.length; offset += 40) {
    const result = await cardsByYgoIds(ctx, ids.slice(offset, offset + 40), includeImages)
    cards.push(...result.cards)
  }
  return cards
}

/** why: YGOPRODeck has no Rush Duel cards, so Scryve ships them with the curated Rush decks. */
const RUSH_CARDS = {
  format: "rush",
  cards: rushCards.map((card) => ({ ...card, game: "ygo" as const })),
  owns: (cardId: string) => cardId.startsWith("rush:"),
  missing: "Rush Duel card is not in the catalog",
}

export async function ygoprodeckImageCandidates(ctx: ActionCtx, cardId: string) {
  if (RUSH_CARDS.owns(cardId)) return []
  const result = await cardsByYgoIds(ctx, [cardId])
  return result.cards
    .flatMap((card) =>
      card.printings.flatMap((printing) => printing.faces.flatMap((face) => face.imageUrl ?? [])),
    )
    .slice(0, 8)
}

export const YGOPRODECK_CATALOG = {
  search: searchYgo,
  byId: (ctx, cardId, includeImages) => cardsByYgoIds(ctx, [cardId], includeImages),
  imageUrl: (card) => ygoImageUrl(card.printingId, card.providerCardId, card.cardId),
  seeded: RUSH_CARDS,
} satisfies CardCatalog
