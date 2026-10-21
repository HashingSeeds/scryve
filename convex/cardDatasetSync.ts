"use node"

import { v } from "convex/values"

import { internal } from "./_generated/api"
import { env, internalAction, type ActionCtx } from "./_generated/server"
import { actionCapabilityEnabled } from "./lib/actionCapabilities"
import { datasetCardKey, MAX_DATASET_BATCH, type DatasetCard } from "./lib/games/cards"
import { GAME_PROVIDERS, isProviderGame } from "./lib/games/providers"

const MAX_BATCH_PRINTINGS = 1_000
const MAX_SWEEP_CARD_KEYS = 8_192
const SYNC_BUDGET_MS = 5 * 60 * 1000

/** why: each printing is one more index read, and a mutation past 4,096 fails in production only; convex-test has no such limit. */
function batchEnd(cards: readonly DatasetCard[], offset: number) {
  let end = offset
  let printings = 0
  while (end < cards.length && end - offset < MAX_DATASET_BATCH) {
    printings += cards[end].printings.length
    if (end > offset && printings > MAX_BATCH_PRINTINGS) break
    end += 1
  }
  return end
}

async function syncDataset(ctx: ActionCtx, game: string): Promise<null> {
  if (!isProviderGame(game)) throw new Error(`${game} has no bulk card catalog`)
  const { catalog, deckFeed } = GAME_PROVIDERS[game]
  const dataset = catalog.bulk
  if (!dataset) throw new Error(`${game} has no bulk card catalog`)
  const startedAt = Date.now()
  const version = await dataset.version()
  const state = await ctx.runQuery(internal.cardCatalog.datasetSync, { game })
  if (state?.version === version) return null
  const cards = (await dataset.load(version)).sort((a, b) => (a.cardId < b.cardId ? -1 : 1))
  if (cards.length === 0) throw new Error(`${game} dataset ${version} has no cards`)
  if (cards.length > MAX_SWEEP_CARD_KEYS)
    throw new Error(`${game} dataset ${version} has more cards than one sweep can check`)
  const pending = state?.pending?.version === version ? state.pending : undefined
  const continueLater = async () => {
    await ctx.scheduler.runAfter(0, internal.cardDatasetSync.sync, { game })
    return null
  }
  let offset = pending?.nextIndex ?? 0
  while (offset < cards.length) {
    if (Date.now() - startedAt > SYNC_BUDGET_MS) return await continueLater()
    const next = await ctx.runMutation(internal.cardCatalog.writeDatasetBatch, {
      game,
      version,
      storedVersion: state?.version,
      offset,
      cards: cards.slice(offset, batchEnd(cards, offset)),
    })
    if (next === null) return null
    offset = next
  }
  const cardKeys = cards.map(datasetCardKey)
  let cursor = pending?.sweepCursor ?? null
  do {
    if (Date.now() - startedAt > SYNC_BUDGET_MS) return await continueLater()
    const swept = await ctx.runMutation(internal.cardCatalog.sweepDatasetBatch, {
      game,
      version,
      total: cards.length,
      cursor,
      cardKeys,
    })
    if (swept === null) return null
    cursor = swept.cursor
  } while (cursor !== null)
  if (deckFeed && (await actionCapabilityEnabled(ctx, game, "exampleDecks")))
    for (const format of deckFeed.formats)
      await ctx.scheduler.runAfter(0, internal.deckCatalogs.refresh, { game, format })
  return null
}

/** why: Node, because parsing the Flesh and Blood dataset takes about 70 MB, past the default runtime's 64 MiB; tests have no memory cap. */
export const sync = internalAction({
  args: { game: v.string() },
  handler: async (ctx, { game }) => await syncDataset(ctx, game),
})

/** why: previews set CARD_CATALOG_SYNC=off so each new one skips downloading and writing the whole dataset. Run `sync` to opt in. */
export const syncScheduled = internalAction({
  args: { game: v.string() },
  handler: async (ctx, { game }) =>
    env.CARD_CATALOG_SYNC === "off" ? null : await syncDataset(ctx, game),
})
