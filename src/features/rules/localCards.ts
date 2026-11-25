import { useEffect, useMemo, useState } from "react"

import { catalogDb } from "@/storage/catalogDb"
import type { LocalCardRow } from "@/storage/catalogDbTypes"

import { normalizeRuleNumber } from "./comprehensiveRules"
import { RULES_TEXT_IN_APP } from "./gameRules"
import {
  decodeLocalCard,
  isLocalCardGame,
  type LocalCard,
  type LocalCardGame,
  localCardsUrl,
  localCardsVersion,
} from "../../../convex/lib/localCards"
import { textSearchKey } from "../../../convex/lib/magicDataset"

const MAX_AGE_MS = 7 * 86_400_000
const PARSE_SLICE_LINES = 2000
const BOARD_SETTLE_MS = 1000
const SEARCH_LIMIT = 3

const versionKey = (game: string) => `localCards:${game}:version`
const etagKey = (game: string) => `localCards:${game}:etag`
const checkedAtKey = (game: string) => `localCards:${game}:checkedAt`

const nextSlice = () => new Promise((resolve) => setTimeout(resolve, 0))

/** why: the file is about 20 MB of text, so lines are read by index a slice at a time instead of split and parsed in one block on the JS thread. */
async function localCardRows(text: string) {
  let start = text.indexOf("\n")
  const version = localCardsVersion(start === -1 ? text : text.slice(0, start))
  const rows: LocalCardRow[] = []
  while (start !== -1) {
    for (let read = 0; read < PARSE_SLICE_LINES && start !== -1; read += 1) {
      const end = text.indexOf("\n", start + 1)
      const json = text.slice(start + 1, end === -1 ? undefined : end)
      const card = json && decodeLocalCard(json)
      if (card)
        rows.push({ cardId: card.cardId, nameKey: textSearchKey(card.name), rank: card.rank, json })
      start = end
    }
    await nextSlice()
  }
  return { version, rows }
}

export async function syncLocalCards(
  game: LocalCardGame,
  { fetcher = fetch, now = Date.now() }: { fetcher?: typeof fetch; now?: number } = {},
) {
  const stored = catalogDb.getMeta(versionKey(game)) !== undefined
  const checkedAt = Number(catalogDb.getMeta(checkedAtKey(game)) ?? 0)
  if (stored && now - checkedAt < MAX_AGE_MS) return false
  const etag = stored ? catalogDb.getMeta(etagKey(game)) : undefined
  const response = await fetcher(
    localCardsUrl(game),
    etag ? { headers: { "If-None-Match": etag } } : undefined,
  )
  if (response.status !== 304 && !response.ok) {
    throw new Error(`Offline card file unavailable (${response.status})`)
  }
  const updated = response.status !== 304
  if (updated) {
    const { version, rows } = await localCardRows(await response.text())
    await catalogDb.replaceLocalCardsAsync(game, rows, version)
    const nextEtag = response.headers.get("etag")
    if (nextEtag) catalogDb.setMeta(etagKey(game), nextEtag)
  }
  catalogDb.setMeta(checkedAtKey(game), String(now))
  return updated
}

const syncing = new Map<LocalCardGame, Promise<boolean>>()

function ensureLocalCards(game: LocalCardGame) {
  let pending = syncing.get(game)
  if (!pending) {
    pending = syncLocalCards(game).finally(() => syncing.delete(game))
    syncing.set(game, pending)
  }
  return pending
}

export function prefetchLocalCards(game: string) {
  if (!RULES_TEXT_IN_APP || !isLocalCardGame(game)) return
  setTimeout(() => void ensureLocalCards(game).catch(() => {}), BOARD_SETTLE_MS)
}

export function useLocalCardSearch(game: string, query: string): LocalCard[] {
  const [refreshed, setRefreshed] = useState(0)
  useEffect(() => {
    if (!RULES_TEXT_IN_APP || !isLocalCardGame(game)) return
    let active = true
    ensureLocalCards(game).then(
      (updated) => {
        if (active && updated) setRefreshed((count) => count + 1)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [game])
  return useMemo(() => {
    const key = textSearchKey(query)
    const ruleNumber = normalizeRuleNumber(query.trim().toLowerCase())
    if (!RULES_TEXT_IN_APP || !isLocalCardGame(game) || key.length < 2 || ruleNumber) return []
    return catalogDb.searchLocalCards(game, key, SEARCH_LIMIT)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- why: a finished refresh has new rows to read for the same query.
  }, [game, query, refreshed])
}
