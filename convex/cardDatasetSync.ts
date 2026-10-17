"use node"

import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { MAX_DATASET_BATCH, type DatasetCard } from "./lib/games/cards"
import { GAME_PROVIDERS, isProviderGame } from "./lib/games/providers"

const MAX_BATCH_PRINTINGS = 1_000
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

/** why: Node, because parsing the Flesh and Blood dataset takes about 70 MB, past the default runtime's 64 MiB; tests have no memory cap. */
export const sync = internalAction({
  args: { game: v.string() },
  handler: async (ctx, { game }): Promise<null> => {
    const dataset = isProviderGame(game) ? GAME_PROVIDERS[game].catalog.bulk : undefined
    if (!dataset) throw new Error(`${game} has no bulk card catalog`)
    const startedAt = Date.now()
    const version = await dataset.version()
    const state = await ctx.runQuery(internal.cardCatalog.datasetSync, { game })
    if (state?.version === version) return null
    const cards = (await dataset.load(version)).sort((a, b) => (a.cardId < b.cardId ? -1 : 1))
    if (cards.length === 0) throw new Error(`${game} dataset ${version} has no cards`)
    let offset = state?.pending?.version === version ? state.pending.nextIndex : 0
    while (offset < cards.length) {
      if (Date.now() - startedAt > SYNC_BUDGET_MS) {
        await ctx.scheduler.runAfter(0, internal.cardDatasetSync.sync, { game })
        return null
      }
      const next = await ctx.runMutation(internal.cardCatalog.writeDatasetBatch, {
        game,
        version,
        storedVersion: state?.version,
        offset,
        total: cards.length,
        cards: cards.slice(offset, batchEnd(cards, offset)),
      })
      if (next === null) return null
      offset = next
    }
    return null
  },
})
