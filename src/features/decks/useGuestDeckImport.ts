import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { convexErrorCode, convexErrorMessage } from "@/utils/convexError"

import {
  acknowledgeGuestDeckImport,
  loadGuestDeck,
  loadGuestDecks,
  useGuestDecks,
  type GuestDeck,
} from "./guestDeck"
import { api } from "../../../convex/_generated/api"

export type GuestDeckImportResult = { imported: number; limitReached: number }

function attemptKey(owner: string, decks: GuestDeck[]) {
  return [owner, ...decks.map((deck) => `${deck.localId}:${deck.updatedAt}`)].join("|")
}

export function useGuestDeckImport(access?: CloudAccess) {
  const guestDecks = useGuestDecks()
  const importGuest = useMutation(api.decks.importGuest)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<GuestDeckImportResult>()
  const latestAccess = useRef(access)
  useLayoutEffect(() => {
    latestAccess.current = access
  }, [access])
  const attempted = useRef<string | undefined>(undefined)
  const running = useRef(false)
  const ownerId = access?.ownerId
  const ready = access?.ready

  const retry = useCallback(async () => {
    const currentAccess = latestAccess.current
    const decks = loadGuestDecks()
    if (!currentAccess?.ready || !currentAccess.ownerId || !decks.length || running.current) return
    const owner = currentAccess.ownerId
    const stillOwner = () => latestAccess.current?.ownerId === owner && latestAccess.current.ready
    running.current = true
    attempted.current = attemptKey(owner, decks)
    setImporting(true)
    setError(undefined)
    setResult(undefined)
    const summary: GuestDeckImportResult = { imported: 0, limitReached: 0 }
    let failure: string | undefined
    try {
      for (const deck of decks) {
        try {
          const response = await importGuest({
            ...deck.deck,
            localId: deck.localId,
            localUpdatedAt: deck.updatedAt,
          })
          if (!stillOwner()) return
          if (response.status === "limit_reached") {
            summary.limitReached += 1
            continue
          }
          summary.imported += 1
          const removed = acknowledgeGuestDeckImport(deck.localId, response.localUpdatedAt)
          if (!removed && loadGuestDeck(deck.localId))
            failure = "A local deck has newer edits. It is still saved on this device."
        } catch (cause) {
          if (!stillOwner()) return
          if (convexErrorCode(cause) === "deck_limit_reached") summary.limitReached += 1
          else
            failure = convexErrorMessage(
              cause,
              "Could not sync a deck. It is saved on this device.",
            )
        }
      }
      setResult(summary)
      setError(failure)
      attempted.current = attemptKey(owner, loadGuestDecks())
    } finally {
      running.current = false
      setImporting(false)
    }
  }, [importGuest])

  useEffect(() => {
    setResult(undefined)
    setError(undefined)
  }, [ownerId])

  useEffect(() => {
    if (!ready || !ownerId || !guestDecks.length || importing) return
    if (attempted.current !== attemptKey(ownerId, guestDecks)) void retry()
  }, [guestDecks, importing, ownerId, ready, retry])

  return { guestDecks, importing, result, error, retry }
}
