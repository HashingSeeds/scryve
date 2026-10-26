import { useEffect, useState } from "react"
import { useConvex } from "convex/react"

import { loadString, saveString } from "@/utils/storage"

import { cardNameIndex, type CardNameIndex } from "./cardNameMatch"
import { api } from "../../../convex/_generated/api"
import { systemDefinition } from "../../../convex/lib/systems"

const CARD_NAMES_KEY = "scryve.cards.names.v1"
const CARD_NAMES_MAX_AGE_MS = 7 * 86_400_000

let lastBuilt: { names: string; index: CardNameIndex } | undefined

function indexFor(names: string) {
  if (lastBuilt?.names !== names) lastBuilt = { names, index: cardNameIndex(names.split("\n")) }
  return lastBuilt.index
}

function cachedNames() {
  try {
    const value: unknown = JSON.parse(loadString(CARD_NAMES_KEY) ?? "null")
    return value &&
      typeof value === "object" &&
      "fetchedAt" in value &&
      typeof value.fetchedAt === "number" &&
      "names" in value &&
      typeof value.names === "string"
      ? { fetchedAt: value.fetchedAt, names: value.names }
      : undefined
  } catch {
    return undefined
  }
}

export function useCardNameIndex(game: string, deviceId: string, wanted: boolean) {
  const convex = useConvex()
  const [index, setIndex] = useState<CardNameIndex>()

  useEffect(() => {
    const scryfallCatalog =
      systemDefinition(game)?.integration.capabilities.cardCatalog.provider === "scryfall"
    if (!wanted || !scryfallCatalog) return
    let active = true
    const cached = cachedNames()
    if (cached) setIndex(indexFor(cached.names))
    if (cached && Date.now() - cached.fetchedAt < CARD_NAMES_MAX_AGE_MS) return
    void convex
      ?.action(api.cards.cardNames, { deviceId })
      .then((names) => {
        saveString(CARD_NAMES_KEY, JSON.stringify({ fetchedAt: Date.now(), names }))
        if (active) setIndex(indexFor(names))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [convex, deviceId, game, wanted])

  return index
}
