import { catalogDb } from "@/storage/catalogDb"
import type { CatalogPrice, CatalogPrinting } from "@/storage/catalogDbTypes"

import {
  catalogCardKingdomOutOfStock,
  catalogSplitCardIds,
  normalizePrintingName,
} from "./catalogSync"
import type { DeckOwnershipItem } from "./deckOwnership"
import { cardKingdomBuilderUrl, tcgplayerMassEntryUrl, type StoreCardInput } from "./storeLinks"

export const STORES = { tcgplayer: "TCGplayer", cardkingdom: "Card Kingdom" } as const
export type Store = keyof typeof STORES

export type CheckoutProblem = "unknown_card" | "not_sold"

export type CheckoutLine = {
  item: DeckOwnershipItem
  problem?: CheckoutProblem
}

export type StoreCheckout = {
  store: Store
  lines: CheckoutLine[]
  cardCount: number
  totalCents: number
  unpricedCount: number
  url?: string
}

// why: a name-only cart lets either store fill a card with any finish, foil included.
function storePrice(
  rows: readonly CatalogPrice[] | undefined,
  store: Store,
  outOfStock: ReadonlySet<string>,
) {
  const cents = (rows ?? []).flatMap((row) =>
    row.source === store &&
    row.retailCents !== undefined &&
    !outOfStock.has(row.finish === "foil" ? `${row.printingId}:foil` : row.printingId)
      ? [row.retailCents]
      : [],
  )
  return cents.length > 0 ? Math.min(...cents) : undefined
}

// why: both stores list split and aftermath cards (Fire // Ice) by full name and other multi-face cards by front face, and reject the rest.
function storeCardName(name: string, split: boolean) {
  return split ? name : name.split(" // ")[0]
}

function candidatePrintings(game: string, item: DeckOwnershipItem) {
  const byCard = catalogDb.findPrintingsByCardId(game, item.cardId)
  if (byCard.length > 0) return byCard
  const byName = catalogDb.findPrintingsByName(game, normalizePrintingName(item.name))
  if (byName.length > 0) return byName
  const chosen = item.printingId ? catalogDb.getPrinting(game, item.printingId) : undefined
  return chosen ? [chosen] : []
}

// why: both stores get names only (a set code Scryfall and TCGplayer spell differently fails the whole Mass Entry list), so each store fills a card with its cheapest printing.
export function planStoreCheckout(
  game: string,
  items: readonly DeckOwnershipItem[],
  store: Store,
): StoreCheckout {
  const missing = items.filter((item) => item.missing > 0)
  const candidates = missing.map((item) => candidatePrintings(game, item))
  const prices = catalogDb.getPricesBatch(
    game,
    candidates.flatMap((printings) => printings.map((printing) => printing.printingId)),
  )
  const outOfStock: ReadonlySet<string> =
    store === "cardkingdom" ? catalogCardKingdomOutOfStock(game) : new Set()
  const splitCards = catalogSplitCardIds(game)
  const price = (printing: CatalogPrinting) =>
    storePrice(prices.get(printing.printingId), store, outOfStock)
  const sold = (printing: CatalogPrinting) =>
    store === "tcgplayer" ? printing.tcgplayerId !== undefined : price(printing) !== undefined

  const cart: StoreCardInput[] = []
  let totalCents = 0
  let unpricedCount = 0
  const lines = missing.map((item, index): CheckoutLine => {
    const printings = candidates[index]
    if (printings.length === 0) return { item, problem: "unknown_card" }
    const listed = printings.filter(sold)
    if (listed.length === 0) return { item, problem: "not_sold" }
    const priced = listed.flatMap((printing) => price(printing) ?? [])
    cart.push({
      name: storeCardName(item.name, splitCards.has(listed[0].cardId)),
      quantity: item.missing,
    })
    if (priced.length === 0) unpricedCount += 1
    else totalCents += Math.min(...priced) * item.missing
    return { item }
  })

  const cardCount = cart.reduce((sum, card) => sum + (card.quantity ?? 0), 0)
  const url =
    cart.length === 0
      ? undefined
      : store === "tcgplayer"
        ? tcgplayerMassEntryUrl(cart)
        : cardKingdomBuilderUrl(cart)
  return { store, lines, cardCount, totalCents, unpricedCount, url }
}
