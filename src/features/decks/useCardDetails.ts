import { useCallback, useEffect, useRef, useState } from "react"
import { useAction, useConvexConnectionState } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { LocalGameRepository } from "@/features/game/localPersistence"
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
  printingId?: string
  providerCardId?: string
  legacyDetailKey?: string
}

export function useCardDetails(card?: CardLookup, requireCommanderRules = false) {
  const byId = useAction(api.cards.byId)
  const byCatalogId = useAction(api.cards.byCatalogId)
  const byPokemonReference = useAction(api.cards.byPokemonReference)
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const connection = useConvexConnectionState()
  const offline = connection?.isWebSocketConnected === false
  const [detailsByKey, setDetailsByKey] = useState<Record<string, FocusedCardDetails>>(() =>
    loadCardDetails(),
  )
  const [failure, setFailure] = useState<{ key: string; message: string; retryAfterMs?: number }>()
  const [attempt, setAttempt] = useState(0)
  const enrichmentAttempts = useRef(new Set<string>())
  const {
    detailKey,
    name,
    game = "mtg",
    scryfallId,
    catalogCardId,
    originalReference,
    printingId,
    providerCardId,
    legacyDetailKey,
  } = card ?? {}
  const magicId =
    scryfallId ??
    (game === "mtg"
      ? [printingId, providerCardId].find((id) => id && /^[0-9a-f-]{36}$/i.test(id))
      : undefined)

  const retryDetails = useCallback(() => {
    setFailure(undefined)
    setAttempt((current) => current + 1)
  }, [])

  useEffect(() => {
    let active = true
    setFailure((current) => (current?.key === detailKey ? current : undefined))
    async function load() {
      if (!detailKey || !name) return
      const warmed =
        detailsByKey[detailKey] ??
        readCardDetail(detailKey) ??
        (legacyDetailKey
          ? (detailsByKey[legacyDetailKey] ?? readCardDetail(legacyDetailKey))
          : undefined)
      const enrichmentKey = `${detailKey}:${attempt}`
      const needsFaces = game === "mtg" && name.includes(" // ")
      if (
        warmed &&
        (offline ||
          ((!needsFaces || warmed.faceDetails !== undefined) &&
            (!requireCommanderRules ||
              (warmed.commanderEligibility &&
                warmed.commanderLegality &&
                warmed.colorIdentity !== undefined &&
                Date.parse(warmed.commanderRulesUpdatedAt ?? "") >= Date.now() - 86_400_000))) ||
          enrichmentAttempts.current.has(enrichmentKey))
      ) {
        if (active && !detailsByKey[detailKey])
          setDetailsByKey((current) => ({ ...current, [detailKey]: warmed }))
        return
      }
      if (offline) {
        if (warmed && !detailsByKey[detailKey])
          setDetailsByKey((current) => ({ ...current, [detailKey]: warmed }))
        if (active)
          setFailure({ key: detailKey, message: "You're offline. Showing saved card info." })
        return
      }
      try {
        const details = magicId
          ? await byId({ scryfallId: magicId, deviceId })
          : catalogCardId
            ? catalogCardDetails(await byCatalogId({ game, cardId: catalogCardId, deviceId }))
            : game === "pokemon" && originalReference
              ? catalogCardDetails(await byPokemonReference({ name, originalReference, deviceId }))
              : undefined
        if (!active) return
        if (requireCommanderRules || needsFaces) enrichmentAttempts.current.add(enrichmentKey)
        if (details) {
          setFailure(undefined)
          saveCardDetails({ [detailKey]: details })
          setDetailsByKey((current) => ({ ...current, [detailKey]: details }))
          if (needsFaces && details.faceDetails === undefined) {
            setFailure({
              key: detailKey,
              message: "Could not load both faces. Showing saved card info.",
            })
          } else if (
            requireCommanderRules &&
            !(Date.parse(details.commanderRulesUpdatedAt ?? "") >= Date.now() - 86_400_000)
          ) {
            setFailure({
              key: detailKey,
              message: "Commander rules could not be refreshed. Showing saved card info.",
            })
          }
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
    magicId,
    catalogCardId,
    originalReference,
    byId,
    byCatalogId,
    byPokemonReference,
    deviceId,
    detailsByKey,
    attempt,
    requireCommanderRules,
    legacyDetailKey,
  ])

  const activeFailure = failure?.key === detailKey ? failure : undefined
  const activeDetails = detailKey ? detailsByKey[detailKey] : undefined
  const needsCurrentRules =
    requireCommanderRules &&
    !offline &&
    !(Date.parse(activeDetails?.commanderRulesUpdatedAt ?? "") >= Date.now() - 86_400_000)
  return {
    detailsByKey,
    details:
      activeDetails && needsCurrentRules
        ? { ...activeDetails, commanderEligibility: undefined, commanderLegality: undefined }
        : activeDetails,
    detailsError: activeFailure?.message,
    detailsRetryAfterMs: activeFailure?.retryAfterMs,
    retryDetails,
  }
}
