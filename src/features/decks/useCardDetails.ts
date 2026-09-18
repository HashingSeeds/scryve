import { useCallback, useEffect, useState } from "react"
import { useAction } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"

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
  const [failure, setFailure] = useState<{ key: string; message: string; retryAfterMs?: number }>()
  const [attempt, setAttempt] = useState(0)
  const { detailKey, name, game = "mtg", scryfallId, catalogCardId, originalReference } = card ?? {}

  const retryDetails = useCallback(() => {
    setFailure(undefined)
    setAttempt((current) => current + 1)
  }, [])

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
            retryAfterMs: convexRetryAfterMs(cause),
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
    attempt,
  ])

  const activeFailure = failure?.key === detailKey ? failure : undefined
  return {
    detailsByKey,
    details: detailKey ? detailsByKey[detailKey] : undefined,
    detailsError: activeFailure?.message,
    detailsRetryAfterMs: activeFailure?.retryAfterMs,
    retryDetails,
  }
}
