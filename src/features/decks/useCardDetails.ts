import { useCallback, useEffect, useState } from "react"
import { useAction, useConvexConnectionState } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"

import { loadCardDetails, readCardDetail, saveCardDetails } from "./cardDetailsCache"
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
  const connection = useConvexConnectionState()
  const offline = connection?.isWebSocketConnected === false
  const [detailsByKey, setDetailsByKey] = useState<Record<string, FocusedCardDetails>>(() =>
    loadCardDetails(),
  )
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
      if (!detailKey || !name) return
      const warmed = detailsByKey[detailKey] ?? readCardDetail(detailKey)
      if (warmed) {
        if (active && !detailsByKey[detailKey])
          setDetailsByKey((current) => ({ ...current, [detailKey]: warmed }))
        return
      }
      if (offline) {
        if (active)
          setFailure({ key: detailKey, message: "You're offline. Showing saved card info." })
        return
      }
      try {
        const details = scryfallId
          ? await byId({ scryfallId })
          : catalogCardId
            ? catalogCardDetails(await byCatalogId({ game, cardId: catalogCardId }))
            : game === "pokemon" && originalReference
              ? catalogCardDetails(await byPokemonReference({ name, originalReference }))
              : undefined
        if (!active) return
        if (details) {
          saveCardDetails({ [detailKey]: details })
          setDetailsByKey((current) => ({ ...current, [detailKey]: details }))
        } else setFailure({ key: detailKey, message: "No additional card details are available." })
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
    offline,
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
