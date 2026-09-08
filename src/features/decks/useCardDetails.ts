import { useEffect, useState } from "react"
import { useAction } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { convexErrorMessage } from "@/utils/convexError"

import { catalogCardDetails } from "./cardFocus"
import { api } from "../../../convex/_generated/api"

type CardLookup = {
  detailKey: string
  name: string
  game?: string
  scryfallId?: string
  catalogCardId?: string
  originalReference?: string
}

export function useCardDetails(card?: CardLookup) {
  const byId = useAction(api.cards.byId)
  const byCatalogId = useAction(api.cards.byCatalogId)
  const byPokemonReference = useAction(api.cards.byPokemonReference)
  const [detailsByKey, setDetailsByKey] = useState<Record<string, FocusedCardDetails>>({})
  const [failure, setFailure] = useState<{ key: string; message: string }>()
  const { detailKey, name, game = "mtg", scryfallId, catalogCardId, originalReference } = card ?? {}

  useEffect(() => {
    let active = true
    setFailure(undefined)
    async function load() {
      if (!detailKey || !name || detailsByKey[detailKey]) return
      try {
        const details = scryfallId
          ? await byId({ scryfallId })
          : catalogCardId
            ? catalogCardDetails(await byCatalogId({ game, cardId: catalogCardId }))
            : game === "pokemon" && originalReference
              ? catalogCardDetails(await byPokemonReference({ name, originalReference }))
              : undefined
        if (!active) return
        if (details) setDetailsByKey((current) => ({ ...current, [detailKey]: details }))
        else setFailure({ key: detailKey, message: "No additional card details are available." })
      } catch (cause) {
        if (active)
          setFailure({
            key: detailKey,
            message: convexErrorMessage(cause, "Could not load card details"),
          })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [
    detailKey,
    name,
    game,
    scryfallId,
    catalogCardId,
    originalReference,
    byId,
    byCatalogId,
    byPokemonReference,
    detailsByKey,
  ])

  return {
    detailsByKey,
    details: detailKey ? detailsByKey[detailKey] : undefined,
    detailsError: failure?.key === detailKey ? failure?.message : undefined,
  }
}
