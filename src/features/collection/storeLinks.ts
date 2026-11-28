import { storage } from "@/utils/storage"

const AFFILIATE_PREF_KEY = "scryve.storeLinks.affiliate.v1"

export interface StoreCardInput {
  name: string
  setCode?: string
  setName?: string
  collectorNumber?: string
  tcgplayerId?: number
  finish?: string
  quantity?: number
}

function tcgplayerAffiliateUrl(): string | undefined {
  const value = process.env.EXPO_PUBLIC_TCGPLAYER_AFFILIATE_URL?.trim()
  return value ? value : undefined
}

function cardKingdomPartner(): string | undefined {
  const value = process.env.EXPO_PUBLIC_CARDKINGDOM_PARTNER?.trim()
  return value ? value : undefined
}

export function affiliateLinksEnabled(): boolean {
  return storage.getBoolean(AFFILIATE_PREF_KEY) ?? true
}

export function setAffiliateLinksEnabled(enabled: boolean): void {
  storage.set(AFFILIATE_PREF_KEY, enabled)
}

function wrapAffiliateUrl(
  baseUrl: string,
  affiliateTemplate: string | undefined,
  enabled: boolean,
) {
  if (!enabled || !affiliateTemplate) return baseUrl
  if (affiliateTemplate.includes("{url}")) {
    return affiliateTemplate.replace("{url}", encodeURIComponent(baseUrl))
  }
  const joiner = affiliateTemplate.includes("?") ? "&" : "?"
  return `${affiliateTemplate}${joiner}u=${encodeURIComponent(baseUrl)}`
}

export function tcgplayerCardUrl(
  card: StoreCardInput,
  options: { affiliate?: boolean } = {},
): string {
  const useAffiliate = options.affiliate ?? affiliateLinksEnabled()
  const direct = card.tcgplayerId
    ? `https://www.tcgplayer.com/product/${card.tcgplayerId}`
    : `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(
        [card.name, card.setName ?? card.setCode].filter(Boolean).join(" "),
      )}`
  return wrapAffiliateUrl(direct, tcgplayerAffiliateUrl(), useAffiliate)
}

// why: both stores' list tools match double-faced and adventure cards by front face and reject the full Scryfall name.
function listName(name: string) {
  return name.split(" // ")[0]
}

function listLines(cards: readonly StoreCardInput[]) {
  return cards
    .filter((card) => (card.quantity ?? 1) > 0)
    .map((card) => `${Math.max(1, Math.floor(card.quantity ?? 1))} ${listName(card.name)}`)
}

export function tcgplayerMassEntryUrl(
  cards: readonly StoreCardInput[],
  options: { affiliate?: boolean } = {},
): string {
  const useAffiliate = options.affiliate ?? affiliateLinksEnabled()
  const direct = `https://www.tcgplayer.com/massentry?productline=Magic&c=${encodeURIComponent(listLines(cards).join("||"))}`
  return wrapAffiliateUrl(direct, tcgplayerAffiliateUrl(), useAffiliate)
}

export function cardKingdomBuilderUrl(
  cards: readonly StoreCardInput[],
  options: { affiliate?: boolean } = {},
): string {
  const useAffiliate = options.affiliate ?? affiliateLinksEnabled()
  const partner = cardKingdomPartner()
  const params = new URLSearchParams({ c: listLines(cards).join("\n") })
  if (useAffiliate && partner) params.set("partner", partner)
  return `https://www.cardkingdom.com/builder?${params.toString()}`
}

export function cardKingdomCardUrl(
  card: StoreCardInput,
  options: { buylist?: boolean; affiliate?: boolean } = {},
): string {
  const useAffiliate = options.affiliate ?? affiliateLinksEnabled()
  const query = encodeURIComponent(card.name)
  const path = options.buylist
    ? `https://www.cardkingdom.com/purchasing/mtg_singles?filter[search]=mtg_advanced&filter[name]=${query}`
    : `https://www.cardkingdom.com/catalog/search?search=header&filter[name]=${query}`
  const partner = cardKingdomPartner()
  if (!useAffiliate || !partner) return path
  return `${path}&partner=${encodeURIComponent(partner)}`
}
