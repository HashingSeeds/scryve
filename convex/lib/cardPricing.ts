import { objectRecord } from "./scryfall"

export const MTG_PRINTINGS_PATH = "/datasets/mtg/printings.json"
export const MTG_PRICES_PATH = "/datasets/mtg/prices.json"
export const MTG_PRINTINGS_URL = `https://ygo-images.scryve.sow.care${MTG_PRINTINGS_PATH}`
export const MTG_PRICES_URL = `https://ygo-images.scryve.sow.care${MTG_PRICES_PATH}`

export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG"
export type CardFinish = "nonfoil" | "foil" | "etched"
export type PriceSource = "tcgplayer" | "cardkingdom" | "cardkingdom_buylist" | "cardmarket"

export const CONDITION_MULTIPLIERS: Record<CardCondition, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.68,
  HP: 0.5,
  DMG: 0.3,
}

export const FINISH_BIT_NONFOIL = 1
export const FINISH_BIT_FOIL = 2
export const FINISH_BIT_ETCHED = 4

export type MtgPrintingTuple = [
  scryfallId: string,
  oracleId: string,
  name: string,
  setCode: string,
  collectorNumber: string,
  rarity: string,
  finishMask: number,
  tcgplayerId: number,
  imagePath: string,
]

export interface MtgPrintingsPack {
  version: string
  sets: Record<string, string>
  rows: MtgPrintingTuple[]
}

export type MtgPriceTuple = (number | null)[]

export interface MtgPricesPack {
  version: string
  asOf: number
  prices: Record<string, MtgPriceTuple>
}

export interface DecodedPrinting {
  printingId: string
  cardId: string
  name: string
  setCode: string
  setName: string
  collectorNumber: string
  rarity: string
  finishes: CardFinish[]
  tcgplayerId?: number
  imageUrl?: string
  smallImageUrl?: string
}

export interface DecodedPrice {
  printingId: string
  usdCents?: number
  usdFoilCents?: number
  usdEtchedCents?: number
  eurCents?: number
  eurFoilCents?: number
  ckRetailCents?: number
  ckFoilCents?: number
  ckBuylistCents?: number
  ckFoilBuylistCents?: number
}

const SCRYFALL_IMAGE_PREFIX = "https://cards.scryfall.io/"
const RARITY_CODES: Record<string, string> = {
  common: "c",
  uncommon: "u",
  rare: "r",
  mythic: "m",
  special: "s",
  bonus: "b",
}
const RARITY_NAMES: Record<string, string> = {
  c: "common",
  u: "uncommon",
  r: "rare",
  m: "mythic",
  s: "special",
  b: "bonus",
}

export function encodeFinishes(finishes: readonly string[]): number {
  let mask = 0
  for (const finish of finishes) {
    if (finish === "nonfoil") mask |= FINISH_BIT_NONFOIL
    else if (finish === "foil") mask |= FINISH_BIT_FOIL
    else if (finish === "etched") mask |= FINISH_BIT_ETCHED
  }
  return mask || FINISH_BIT_NONFOIL
}

export function decodeFinishes(mask: number): CardFinish[] {
  const finishes: CardFinish[] = []
  if (mask & FINISH_BIT_NONFOIL) finishes.push("nonfoil")
  if (mask & FINISH_BIT_FOIL) finishes.push("foil")
  if (mask & FINISH_BIT_ETCHED) finishes.push("etched")
  return finishes.length > 0 ? finishes : ["nonfoil"]
}

export function encodeRarity(rarity: string | undefined): string {
  if (!rarity) return "c"
  return RARITY_CODES[rarity.toLowerCase()] ?? rarity.slice(0, 1).toLowerCase()
}

export function decodeRarity(code: string): string {
  return RARITY_NAMES[code] ?? code
}

export function compressScryfallImagePath(imageUrl: string | undefined): string {
  if (!imageUrl) return ""
  if (!imageUrl.startsWith(SCRYFALL_IMAGE_PREFIX)) return imageUrl
  const rest = imageUrl.slice(SCRYFALL_IMAGE_PREFIX.length)
  if (rest.startsWith("normal/")) return rest.slice("normal/".length)
  if (rest.startsWith("small/")) return rest.slice("small/".length)
  return imageUrl
}

export function expandScryfallImageUrls(imagePath: string): {
  imageUrl?: string
  smallImageUrl?: string
} {
  if (!imagePath) return {}
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return { imageUrl: imagePath, smallImageUrl: imagePath }
  }
  return {
    imageUrl: `${SCRYFALL_IMAGE_PREFIX}normal/${imagePath}`,
    smallImageUrl: `${SCRYFALL_IMAGE_PREFIX}small/${imagePath}`,
  }
}

export function parsePriceCents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100)
  }
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.round(parsed * 100)
}

export function trimPriceTuple(values: readonly (number | undefined)[]): MtgPriceTuple | undefined {
  let end = values.length
  while (end > 0 && values[end - 1] === undefined) end -= 1
  if (end === 0) return undefined
  return values.slice(0, end).map((entry) => entry ?? null)
}

export function decodePriceTuple(printingId: string, tuple: MtgPriceTuple): DecodedPrice {
  const at = (index: number): number | undefined => {
    const value = tuple[index]
    return typeof value === "number" && Number.isFinite(value) ? value : undefined
  }
  return {
    printingId,
    usdCents: at(0),
    usdFoilCents: at(1),
    usdEtchedCents: at(2),
    eurCents: at(3),
    eurFoilCents: at(4),
    ckRetailCents: at(5),
    ckFoilCents: at(6),
    ckBuylistCents: at(7),
    ckFoilBuylistCents: at(8),
  }
}

export function decodeMtgPrintingsPack(value: unknown): {
  version: string
  printings: DecodedPrinting[]
} {
  const record = objectRecord(value)
  if (!record || typeof record.version !== "string" || !Array.isArray(record.rows)) {
    throw new Error("Invalid MTG printings pack")
  }
  const sets = objectRecord(record.sets) ?? {}
  const printings: DecodedPrinting[] = []
  for (const row of record.rows) {
    if (!Array.isArray(row) || row.length < 9) continue
    const [
      printingId,
      cardId,
      name,
      setCode,
      collectorNumber,
      rarityCode,
      finishMask,
      tcgplayerId,
      imagePath,
    ] = row
    if (
      typeof printingId !== "string" ||
      typeof cardId !== "string" ||
      typeof name !== "string" ||
      typeof setCode !== "string" ||
      typeof collectorNumber !== "string" ||
      typeof rarityCode !== "string" ||
      typeof finishMask !== "number" ||
      typeof tcgplayerId !== "number" ||
      typeof imagePath !== "string"
    ) {
      continue
    }
    const rawSetName = sets[setCode]
    const setName = typeof rawSetName === "string" ? rawSetName : setCode.toUpperCase()
    const { imageUrl, smallImageUrl } = expandScryfallImageUrls(imagePath)
    printings.push({
      printingId,
      cardId,
      name,
      setCode,
      setName,
      collectorNumber,
      rarity: decodeRarity(rarityCode),
      finishes: decodeFinishes(finishMask),
      ...(tcgplayerId > 0 ? { tcgplayerId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(smallImageUrl ? { smallImageUrl } : {}),
    })
  }
  return { version: record.version, printings }
}

export function decodeMtgPricesPack(value: unknown): {
  version: string
  asOf: number
  prices: DecodedPrice[]
} {
  const record = objectRecord(value)
  const priceMap = objectRecord(record?.prices)
  if (
    !record ||
    typeof record.version !== "string" ||
    typeof record.asOf !== "number" ||
    !priceMap
  ) {
    throw new Error("Invalid MTG prices pack")
  }
  const prices: DecodedPrice[] = []
  for (const [printingId, tuple] of Object.entries(priceMap)) {
    if (!Array.isArray(tuple)) continue
    prices.push(decodePriceTuple(printingId, tuple as MtgPriceTuple))
  }
  return { version: record.version, asOf: record.asOf, prices }
}

export function priceCentsForFinish(
  price: Omit<DecodedPrice, "printingId"> | undefined,
  finish: string,
  condition: string = "NM",
  source: PriceSource = "tcgplayer",
): number | undefined {
  if (!price) return undefined
  let base: number | undefined
  if (source === "cardkingdom_buylist") {
    base =
      finish === "foil" || finish === "etched"
        ? (price.ckFoilBuylistCents ?? price.ckBuylistCents)
        : (price.ckBuylistCents ?? price.ckFoilBuylistCents)
  } else if (source === "cardkingdom") {
    base =
      finish === "foil" || finish === "etched"
        ? (price.ckFoilCents ?? price.ckRetailCents)
        : (price.ckRetailCents ?? price.ckFoilCents)
  } else if (source === "cardmarket") {
    base =
      finish === "foil" || finish === "etched"
        ? (price.eurFoilCents ?? price.eurCents)
        : (price.eurCents ?? price.eurFoilCents)
  } else {
    if (finish === "etched") {
      base = price.usdEtchedCents ?? price.usdFoilCents ?? price.usdCents
    } else if (finish === "foil") {
      base = price.usdFoilCents ?? price.usdEtchedCents ?? price.usdCents
    } else {
      base = price.usdCents ?? price.usdFoilCents ?? price.usdEtchedCents
    }
  }
  if (base === undefined) return undefined
  const multiplier = CONDITION_MULTIPLIERS[condition as CardCondition] ?? 1
  return Math.round(base * multiplier)
}
