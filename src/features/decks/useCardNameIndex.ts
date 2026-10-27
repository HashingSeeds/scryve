import { useEffect, useState } from "react"
import { useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { loadString, saveString } from "@/utils/storage"

import { cardNameIndex, type CardNameIndex } from "./cardNameMatch"
import { api } from "../../../convex/_generated/api"
import { systemDefinition } from "../../../convex/lib/systems"

type CardNameCatalog = FunctionReturnType<typeof api.cards.cardNameCatalog>

const CARD_NAMES_KEY = "scryve.cards.names.v2"
const CARD_NAMES_MAX_AGE_MS = 7 * 86_400_000

let lastBuilt: { catalog: CardNameCatalog; index: CardNameIndex } | undefined

function indexFor(catalog: CardNameCatalog) {
  if (
    lastBuilt?.catalog.names !== catalog.names ||
    lastBuilt.catalog.alternateNames !== catalog.alternateNames
  ) {
    const alternates = catalog.alternateNames
      .split("\n")
      .map((line) => line.split("\t"))
      .flatMap(([printed, name]) => (printed && name ? [[printed, name] as const] : []))
    lastBuilt = { catalog, index: cardNameIndex(catalog.names.split("\n"), alternates) }
  }
  return lastBuilt.index
}

function cachedCatalog() {
  try {
    const value: unknown = JSON.parse(loadString(CARD_NAMES_KEY) ?? "null")
    return value &&
      typeof value === "object" &&
      "fetchedAt" in value &&
      typeof value.fetchedAt === "number" &&
      "names" in value &&
      typeof value.names === "string" &&
      "alternateNames" in value &&
      typeof value.alternateNames === "string"
      ? { fetchedAt: value.fetchedAt, names: value.names, alternateNames: value.alternateNames }
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
    const cached = cachedCatalog()
    if (cached) setIndex(indexFor(cached))
    if (cached && Date.now() - cached.fetchedAt < CARD_NAMES_MAX_AGE_MS) return
    void convex
      ?.action(api.cards.cardNameCatalog, { deviceId })
      .then((catalog) => {
        saveString(CARD_NAMES_KEY, JSON.stringify({ fetchedAt: Date.now(), ...catalog }))
        if (active) setIndex(indexFor(catalog))
      })
      .catch(() => {
        if (active && !cached) setIndex(cardNameIndex([]))
      })
    return () => {
      active = false
    }
  }, [convex, deviceId, game, wanted])

  return index
}
