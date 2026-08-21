import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"

const SCRYFALL_BASE_URL = "https://api.scryfall.com"

const SCRYFALL_HEADERS = {
  "Accept": "application/json;q=0.9,*/*;q=0.8",
  "User-Agent": "ScryveDeckBuilder/1.0 (https://scryve.sow.care)",
}

const SCRYFALL_SLOW_INTERVAL_MS = 500
const SCRYFALL_DEFAULT_INTERVAL_MS = 100
const SCRYFALL_RATE_LIMIT_BLOCK_MS = 30_000

type ScryfallRequestOptions = {
  method?: "GET" | "POST"
  body?: string
}

function requestPolicy(path: string) {
  if (path.startsWith("/cards/search"))
    return { bucket: "scryfall:cards-search", intervalMs: SCRYFALL_SLOW_INTERVAL_MS }
  if (path === "/cards/collection")
    return { bucket: "scryfall:cards-collection", intervalMs: SCRYFALL_SLOW_INTERVAL_MS }
  return { bucket: "scryfall:default", intervalMs: SCRYFALL_DEFAULT_INTERVAL_MS }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export async function fetchScryfall(
  ctx: ActionCtx,
  path: string,
  options: ScryfallRequestOptions = {},
) {
  const policy = requestPolicy(path)
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, policy)
  if (waitMs > 0) await wait(waitMs)
  const response = await fetch(`${SCRYFALL_BASE_URL}${path}`, {
    method: options.method,
    headers: {
      ...SCRYFALL_HEADERS,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body,
  })
  if (response.status === 429)
    await ctx.runMutation(internal.externalApiRateLimits.block, {
      bucket: policy.bucket,
      durationMs: SCRYFALL_RATE_LIMIT_BLOCK_MS,
    })
  return response
}

const FACE_ORACLE_SEPARATOR = "\n—\n"
const FACE_INLINE_SEPARATOR = " // "

export type CardReference = {
  scryfallId: string
  oracleId: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  setName?: string
  setCode?: string
  collectorNumber?: string
  rarity?: string
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringField(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function joinedFaceField(faces: unknown[], key: string, separator: string): string | undefined {
  const values = faces
    .map((face) => stringField(objectRecord(face), key))
    .filter((value): value is string => value !== undefined)
  return values.length > 0 ? values.join(separator) : undefined
}

function cardOrFaceField(
  card: Record<string, unknown>,
  faces: unknown[],
  key: string,
  separator: string,
) {
  return stringField(card, key) ?? joinedFaceField(faces, key, separator)
}

function sizedImageUrl(
  imageUris: Record<string, unknown> | null,
  faceImages: Record<string, unknown> | null,
  size: "normal" | "small",
) {
  return stringField(imageUris, size) ?? stringField(faceImages, size)
}

export function normalizeScryfallCard(value: unknown): CardReference | null {
  const card = objectRecord(value)
  if (!card || typeof card.id !== "string" || typeof card.name !== "string") return null
  const oracleId = typeof card.oracle_id === "string" ? card.oracle_id : card.id
  const imageUris = objectRecord(card.image_uris)
  const faces = Array.isArray(card.card_faces) ? card.card_faces : []
  const firstFace = objectRecord(faces[0])
  const faceImages = firstFace ? objectRecord(firstFace.image_uris) : null
  const imageUrl = sizedImageUrl(imageUris, faceImages, "normal")
  const smallImageUrl = sizedImageUrl(imageUris, faceImages, "small")
  const manaCost = cardOrFaceField(card, faces, "mana_cost", FACE_INLINE_SEPARATOR)
  const typeLine = cardOrFaceField(card, faces, "type_line", FACE_INLINE_SEPARATOR)
  const oracleText = cardOrFaceField(card, faces, "oracle_text", FACE_ORACLE_SEPARATOR)
  const setName = stringField(card, "set_name")
  const setCode = stringField(card, "set")
  const collectorNumber = stringField(card, "collector_number")
  const rarity = stringField(card, "rarity")
  return {
    scryfallId: card.id,
    oracleId,
    name: card.name,
    ...(imageUrl ? { imageUrl } : {}),
    ...(smallImageUrl ? { smallImageUrl } : {}),
    ...(manaCost ? { manaCost } : {}),
    ...(typeLine ? { typeLine } : {}),
    ...(oracleText ? { oracleText } : {}),
    ...(setName ? { setName } : {}),
    ...(setCode ? { setCode } : {}),
    ...(collectorNumber ? { collectorNumber } : {}),
    ...(rarity ? { rarity } : {}),
  }
}
