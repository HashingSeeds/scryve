import { catalogDb } from "@/storage/catalogDb"
import type { CatalogPrice, CatalogPrinting } from "@/storage/catalogDbTypes"

import { normalizePrintingName } from "./catalogSync"
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

const FINISHES = ["nonfoil", "foil", "etched"] as const

function storePrice(rows: readonly CatalogPrice[] | undefined, store: Store) {
  for (const finish of FINISHES) {
    const cents = rows?.find((row) => row.source === store && row.finish === finish)?.retailCents
    if (cents !== undefined) return cents
  }
  return undefined
}

function candidatePrintings(game: string, item: DeckOwnershipItem) {
  const chosen = item.printingId ? catalogDb.getPrinting(game, item.printingId) : undefined
  const byCard = catalogDb.findPrintingsByCardId(game, item.cardId)
  const others =
    byCard.length > 0
      ? byCard
      : catalogDb.findPrintingsByName(game, normalizePrintingName(item.name))
  return {
    chosen,
    all: chosen ? [chosen, ...others.filter((p) => p.printingId !== chosen.printingId)] : others,
  }
}

export function planStoreCheckout(
  game: string,
  items: readonly DeckOwnershipItem[],
  store: Store,
): StoreCheckout {
  const missing = items.filter((item) => item.missing > 0)
  const candidates = missing.map((item) => candidatePrintings(game, item))
  const prices = catalogDb.getPricesBatch(
    game,
    candidates.flatMap(({ all }) => all.map((printing) => printing.printingId)),
  )
  const sold = (printing: CatalogPrinting) =>
    store === "tcgplayer"
      ? printing.tcgplayerId !== undefined
      : storePrice(prices.get(printing.printingId), store) !== undefined

  const cart: StoreCardInput[] = []
  let totalCents = 0
  let unpricedCount = 0
  const lines = missing.map((item, index): CheckoutLine => {
    const { chosen, all } = candidates[index]
    if (all.length === 0) return { item, problem: "unknown_card" }
    const listed = all.filter(sold)
    if (listed.length === 0) return { item, problem: "not_sold" }
    const pinned = store === "tcgplayer" && chosen && sold(chosen) ? chosen : undefined
    const priced = (pinned ? [pinned] : listed).flatMap(
      (printing) => storePrice(prices.get(printing.printingId), store) ?? [],
    )
    const unitCents = priced.length > 0 ? Math.min(...priced) : undefined
    cart.push({ name: item.name, setCode: pinned?.setCode, quantity: item.missing })
    if (unitCents === undefined) unpricedCount += 1
    else totalCents += unitCents * item.missing
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
