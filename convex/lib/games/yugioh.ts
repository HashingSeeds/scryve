import {
  compact,
  facet,
  finiteNumber,
  normalizeCardName,
  objectRecord,
  stringValue,
  type NormalizedCard,
} from "./cards"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"
import { env } from "../../_generated/server"

const BASE_URL = "https://db.ygoprodeck.com/api/v7"
const REQUEST_INTERVAL_MS = 100
const REQUEST_TIMEOUT_MS = 10_000

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

export async function searchYgo(ctx: ActionCtx, query: string, includeImages = true) {
  const response = await request(
    ctx,
    `/cardinfo.php?fname=${encodeURIComponent(query)}&num=20&offset=0`,
  )
  if (response.status === 400) return { cards: [], status: response.status }
  if (!response.ok) throw Object.assign(new Error("YGOPRODeck search failed"), { response })
  return {
    cards: normalizeYgoCards(
      (await response.json()) as unknown,
      includeImages ? (env as { YGO_IMAGE_BASE_URL?: string }).YGO_IMAGE_BASE_URL : undefined,
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
      includeImages ? (env as { YGO_IMAGE_BASE_URL?: string }).YGO_IMAGE_BASE_URL : undefined,
    ),
    status: response.status,
  }
}

export function ygoSection(card: NormalizedCard) {
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
