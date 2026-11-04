import { useEffect, useState } from "react"

import { loadString, saveString } from "@/utils/storage"

import { parseMagicCards, type MagicCards } from "./localMagicSearch"
import { saveMagicCards, savedMagicCards } from "./magicCardsFile"
import { MAGIC_DATASET_URL } from "../../../convex/lib/magicDataset"
import { systemDefinition } from "../../../convex/lib/systems"

const META_KEY = "scryve.cards.mtg-dataset.v1"
const MAX_AGE_MS = 7 * 86_400_000

function savedMeta() {
  try {
    const value: unknown = JSON.parse(loadString(META_KEY) ?? "null")
    return value &&
      typeof value === "object" &&
      "checkedAt" in value &&
      typeof value.checkedAt === "number"
      ? {
          checkedAt: value.checkedAt,
          etag: "etag" in value && typeof value.etag === "string" ? value.etag : undefined,
        }
      : undefined
  } catch {
    return undefined
  }
}

export async function fetchMagicCards(fetcher: typeof fetch = fetch): Promise<MagicCards> {
  const meta = savedMeta()
  const readSaved = meta && savedMagicCards()
  if (readSaved && Date.now() - meta.checkedAt < MAX_AGE_MS)
    return parseMagicCards(await readSaved())
  const response = await fetcher(
    MAGIC_DATASET_URL,
    readSaved && meta.etag ? { headers: { "If-None-Match": meta.etag } } : undefined,
  ).catch(() => undefined)
  if (readSaved && (response?.status === 304 || !response?.ok)) {
    if (response?.status === 304)
      saveString(META_KEY, JSON.stringify({ ...meta, checkedAt: Date.now() }))
    return parseMagicCards(await readSaved())
  }
  if (!response?.ok)
    throw new Error(`Magic card file unavailable (${response?.status ?? "offline"})`)
  const text = await response.text()
  const cards = parseMagicCards(text)
  await saveMagicCards(text)
  saveString(
    META_KEY,
    JSON.stringify({ checkedAt: Date.now(), etag: response.headers.get("etag") ?? undefined }),
  )
  return cards
}

let loading: Promise<MagicCards> | undefined
let loaded: MagicCards | undefined

/** why: the parsed file is tens of MB, so a session keeps one copy and every search screen shares it. */
function loadMagicCards() {
  loading ??= fetchMagicCards().then(
    (cards) => (loaded = cards),
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading
}

export function useMagicCards(game: string) {
  const scryfallCatalog =
    systemDefinition(game)?.integration.capabilities.cardCatalog.provider === "scryfall"
  const [cards, setCards] = useState(loaded)

  useEffect(() => {
    if (!scryfallCatalog || cards) return
    let active = true
    loadMagicCards().then(
      (found) => {
        if (active) setCards(found)
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [cards, scryfallCatalog])

  return scryfallCatalog ? cards : undefined
}
